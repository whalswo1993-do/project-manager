import { beforeEach, describe, expect, it, vi } from 'vitest'

// 가짜 Gemini SDK: 호출 인자를 기록하고, 원하는 응답/오류를 돌려준다.
const sdk = vi.hoisted(() => {
  const state = { lastKey: null, lastModel: null, lastParts: null, text: 'hello', error: null }
  class GoogleGenerativeAIError extends Error {}
  class GoogleGenerativeAIFetchError extends GoogleGenerativeAIError {
    constructor(message, status) {
      super(message)
      this.status = status
    }
  }
  class GoogleGenerativeAIResponseError extends GoogleGenerativeAIError {}
  class GoogleGenerativeAIRequestInputError extends GoogleGenerativeAIError {}
  class GoogleGenerativeAI {
    constructor(key) {
      state.lastKey = key
    }
    getGenerativeModel({ model }) {
      state.lastModel = model
      return {
        generateContent: async (parts) => {
          state.lastParts = parts
          if (state.error) throw state.error
          return { response: { text: () => state.text } }
        },
      }
    }
  }
  return {
    state,
    exports: { GoogleGenerativeAI, GoogleGenerativeAIFetchError, GoogleGenerativeAIResponseError, GoogleGenerativeAIRequestInputError },
  }
})
vi.mock('@google/generative-ai', () => sdk.exports)

const { runGemini, isGeminiConfigured, DEFAULT_GEMINI_MODEL } = await import('../api/_lib/gemini.js')
const { ApiError } = await import('../api/_lib/errors.js')
const { default: handler } = await import('../api/gemini.js')

const env = { GEMINI_API_KEY: 'g-test' }
const { GoogleGenerativeAIFetchError: FetchError, GoogleGenerativeAIResponseError: ResponseError, GoogleGenerativeAIRequestInputError: InputError } = sdk.exports

beforeEach(() => {
  sdk.state.lastKey = null
  sdk.state.lastModel = null
  sdk.state.lastParts = null
  sdk.state.text = 'hello'
  sdk.state.error = null
})

describe('runGemini', () => {
  it('키가 없으면 503 not_configured (브라우저 키 직접 호출로 넘어가는 신호)', async () => {
    expect(isGeminiConfigured({})).toBe(false)
    await expect(runGemini({ parts: ['hi'] }, {})).rejects.toMatchObject({ status: 503, code: 'not_configured' })
  })

  it('기존 앱과 같은 기본 모델을 쓰고 parts 를 변형 없이 전달', async () => {
    const parts = [{ inlineData: { data: 'AAA', mimeType: 'image/png' } }, 'prompt']
    const out = await runGemini({ parts }, env)
    expect(out).toEqual({ text: 'hello', model: 'gemini-3.8-flash' })
    expect(DEFAULT_GEMINI_MODEL).toBe('gemini-3.8-flash')
    expect(sdk.state.lastKey).toBe('g-test')
    expect(sdk.state.lastParts).toEqual(parts)
  })

  it('GEMINI_MODEL 로 모델 변경', async () => {
    await runGemini({ parts: ['hi'] }, { ...env, GEMINI_MODEL: 'gemini-x' })
    expect(sdk.state.lastModel).toBe('gemini-x')
  })

  it('입력 검증: 빈 입력/알 수 없는 항목/지원하지 않는 파일 형식은 400', async () => {
    await expect(runGemini({ parts: [] }, env)).rejects.toMatchObject({ status: 400 })
    await expect(runGemini({ parts: [{ foo: 1 }] }, env)).rejects.toMatchObject({ status: 400 })
    await expect(runGemini({ parts: [{ inlineData: { data: 'x', mimeType: 'application/zip' } }] }, env)).rejects.toMatchObject({ code: 'unsupported_media' })
    await expect(runGemini({ parts: [{ inlineData: { data: 'x', mimeType: 'application/pdf' } }] }, env)).resolves.toBeTruthy()
  })

  it('429 는 화면 안내가 감지하는 "429 quota" 문구를 포함', async () => {
    sdk.state.error = new FetchError('[429 Too Many Requests] quota', 429)
    await expect(runGemini({ parts: ['hi'] }, env)).rejects.toMatchObject({ status: 429, code: 'rate_limited', message: expect.stringMatching(/429.*quota/) })
  })

  it('키 오류(400 API key not valid / 403)는 "API_KEY_INVALID" 문구를 포함', async () => {
    sdk.state.error = new FetchError('[400 Bad Request] API key not valid. Please pass a valid API key.', 400)
    await expect(runGemini({ parts: ['hi'] }, env)).rejects.toMatchObject({ status: 502, code: 'upstream_auth', message: expect.stringContaining('API_KEY_INVALID') })
    sdk.state.error = new FetchError('[403 Forbidden] denied', 403)
    await expect(runGemini({ parts: ['hi'] }, env)).rejects.toMatchObject({ code: 'upstream_auth', message: expect.stringContaining('403') })
  })

  it('그 밖의 오류 매핑: 400 / 5xx / 차단 / 입력 오류', async () => {
    sdk.state.error = new FetchError('[400 Bad Request] bad payload', 400)
    await expect(runGemini({ parts: ['hi'] }, env)).rejects.toMatchObject({ status: 400, code: 'upstream_bad_request' })
    sdk.state.error = new FetchError('[503 Service Unavailable] busy', 503)
    await expect(runGemini({ parts: ['hi'] }, env)).rejects.toMatchObject({ status: 502, code: 'upstream_error' })
    sdk.state.error = new ResponseError('blocked by safety')
    await expect(runGemini({ parts: ['hi'] }, env)).rejects.toMatchObject({ status: 422, code: 'blocked' })
    sdk.state.error = new InputError('bad input')
    await expect(runGemini({ parts: ['hi'] }, env)).rejects.toMatchObject({ status: 400, code: 'bad_request' })
  })

  it('예상치 못한 오류의 원문은 노출하지 않는다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    sdk.state.error = new Error('secret internal detail')
    const err = await runGemini({ parts: ['hi'] }, env).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(500)
    expect(err.message).not.toContain('secret internal detail')
  })
})

describe('POST /api/gemini 핸들러', () => {
  function call({ method = 'POST', headers = {}, body } = {}) {
    const res = {
      headers: {},
      statusCode: 0,
      payload: null,
      setHeader(k, v) { this.headers[k] = v },
      status(c) { this.statusCode = c; return this },
      json(p) { this.payload = p; return this },
    }
    return handler({ method, headers, body }, res).then(() => res)
  }

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'g-test'
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => 'grade3' })))
  })

  it('POST 가 아니면 405', async () => {
    expect((await call({ method: 'GET' })).statusCode).toBe(405)
  })

  it('로그인 토큰 없이는 401 이고 Gemini 는 호출되지 않는다', async () => {
    const res = await call({ body: { parts: ['hi'] } })
    expect(res.statusCode).toBe(401)
    expect(sdk.state.lastParts).toBeNull()
  })

  it('정상 호출 → { text, model }, 캐시 금지 헤더', async () => {
    const res = await call({ headers: { authorization: 'Bearer jwt' }, body: { parts: ['hi'] } })
    expect(res.statusCode).toBe(200)
    expect(res.payload).toEqual({ text: 'hello', model: 'gemini-3.8-flash' })
    expect(res.headers['Cache-Control']).toBe('no-store')
  })

  it('AI 를 쓸 수 있는 역할은 admin / grade3 / grade2_5, 그 외(grade2·grade1)는 403 ai_not_allowed 이고 Gemini 는 호출되지 않는다', async () => {
    for (const role of ['admin', 'grade3', 'grade2_5']) {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => role })))
      expect((await call({ headers: { authorization: 'Bearer jwt' }, body: { parts: ['hi'] } })).statusCode).toBe(200)
    }
    sdk.state.lastParts = null
    for (const role of ['grade2', 'grade1']) {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => role })))
      const res = await call({ headers: { authorization: 'Bearer jwt' }, body: { parts: ['hi'] } })
      expect(res.statusCode).toBe(403)
      expect(res.payload.error.code).toBe('ai_not_allowed')
    }
    expect(sdk.state.lastParts).toBeNull()
  })

  it('키 미설정이면 503 not_configured', async () => {
    delete process.env.GEMINI_API_KEY
    const res = await call({ headers: { authorization: 'Bearer jwt' }, body: { parts: ['hi'] } })
    expect(res.statusCode).toBe(503)
    expect(res.payload.error.code).toBe('not_configured')
  })

  it('입력이 너무 크면 413', async () => {
    const res = await call({ headers: { authorization: 'Bearer jwt' }, body: { parts: ['x'.repeat(600001)] } })
    expect(res.statusCode).toBe(413)
  })
})
