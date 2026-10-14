import { beforeEach, describe, expect, it, vi } from 'vitest'

// 가짜 Anthropic SDK: 어떤 요청을 만들어 보내는지 기록하고, 원하는 응답/오류를 돌려준다.
const sdk = vi.hoisted(() => {
  const state = { lastRequest: null, lastOptions: null, response: null, error: null }
  class APIError extends Error {
    constructor(status, message) {
      super(message)
      this.status = status
    }
  }
  class AuthenticationError extends APIError {}
  class PermissionDeniedError extends APIError {}
  class RateLimitError extends APIError {}
  class BadRequestError extends APIError {}
  class Anthropic {
    constructor(options) {
      state.lastOptions = options
      this.beta = {
        messages: {
          stream: (request) => {
            state.lastRequest = request
            return {
              finalMessage: async () => {
                if (state.error) throw state.error
                return state.response
              },
            }
          },
        },
      }
    }
  }
  Object.assign(Anthropic, { APIError, AuthenticationError, PermissionDeniedError, RateLimitError, BadRequestError })
  return { state, Anthropic, errors: { APIError, AuthenticationError, RateLimitError, BadRequestError } }
})
vi.mock('@anthropic-ai/sdk', () => ({ default: sdk.Anthropic }))

const { ClaudeError, runClaude, toContentBlocks, isClaudeConfigured } = await import('../api/_lib/claude.js')
const { verifyAppUser } = await import('../api/_lib/auth.js')
const { default: handler } = await import('../api/claude.js')

const okMessage = (text = '{"a":1}') => ({
  model: 'claude-opus-5-5',
  stop_reason: 'end_turn',
  content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }],
  usage: { input_tokens: 1, output_tokens: 1 },
})

beforeEach(() => {
  sdk.state.lastRequest = null
  sdk.state.error = null
  sdk.state.response = okMessage()
})

describe('toContentBlocks', () => {
  it('텍스트 / 이미지 / PDF 를 Claude 블록으로 변환', () => {
    const blocks = toContentBlocks([
      'plain',
      { text: 'obj' },
      { inlineData: { data: 'AAA', mimeType: 'image/png' } },
      { inlineData: { data: 'BBB', mimeType: 'application/pdf' } },
    ])
    expect(blocks).toEqual([
      { type: 'text', text: 'plain' },
      { type: 'text', text: 'obj' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'BBB' } },
    ])
  })

  it('지원하지 않는 형식/빈 입력은 400', () => {
    expect(() => toContentBlocks([{ inlineData: { data: 'x', mimeType: 'application/zip' } }])).toThrow(ClaudeError)
    expect(() => toContentBlocks([])).toThrow(ClaudeError)
    expect(() => toContentBlocks([{ foo: 1 }])).toThrow(ClaudeError)
  })
})

describe('runClaude', () => {
  const env = { ANTHROPIC_API_KEY: 'sk-test' }

  it('키가 없으면 503 not_configured', async () => {
    expect(isClaudeConfigured({})).toBe(false)
    await expect(runClaude({ parts: ['hi'] }, {})).rejects.toMatchObject({ status: 503, code: 'not_configured' })
  })

  it('기본 모델/스트리밍 요청 형태 + 텍스트 블록만 합쳐서 반환', async () => {
    const out = await runClaude({ parts: ['hi'] }, env)
    expect(out.text).toBe('{"a":1}')
    const req = sdk.state.lastRequest
    expect(sdk.state.lastOptions).toEqual({ apiKey: 'sk-test' })
    expect(req).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 64000,
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
    // 지원하지 않는 파라미터를 보내지 않는다 (thinking 끄기, sampling, prefill 등)
    expect(req).not.toHaveProperty('thinking')
    expect(req).not.toHaveProperty('temperature')
    expect(req).not.toHaveProperty('tool_choice')
  })

  it('ANTHROPIC_MODEL / EFFORT 환경변수로 변경 가능, Haiku 는 fallbacks 제외', async () => {
    await runClaude({ parts: ['hi'] }, { ...env, ANTHROPIC_MODEL: 'claude-haiku-5-5', ANTHROPIC_EFFORT: 'low' })
    expect(sdk.state.lastRequest).toMatchObject({ model: 'claude-haiku-5-5', output_config: { effort: 'low' } })
    expect(sdk.state.lastRequest).not.toHaveProperty('fallbacks')
    expect(sdk.state.lastRequest).not.toHaveProperty('betas')

    await runClaude({ parts: ['hi'] }, { ...env, ANTHROPIC_MODEL: 'claude-sonnet-5-5' })
    expect(sdk.state.lastRequest).toMatchObject({ model: 'claude-sonnet-5-5', fallbacks: 'default' })
  })

  it('max_tokens 는 상한을 넘지 못한다', async () => {
    await runClaude({ parts: ['hi'], maxTokens: 1_000_000 }, env)
    expect(sdk.state.lastRequest.max_tokens).toBe(64000)
    await runClaude({ parts: ['hi'], maxTokens: 500 }, env)
    expect(sdk.state.lastRequest.max_tokens).toBe(500)
  })

  it('refusal / max_tokens 중단은 오류로 알린다', async () => {
    sdk.state.response = { ...okMessage(), stop_reason: 'refusal' }
    await expect(runClaude({ parts: ['hi'] }, env)).rejects.toMatchObject({ status: 422, code: 'refusal' })
    sdk.state.response = { ...okMessage(), stop_reason: 'max_tokens' }
    await expect(runClaude({ parts: ['hi'] }, env)).rejects.toMatchObject({ code: 'truncated' })
  })

  it('SDK 오류를 상태코드/문구로 변환 (429 는 "429 quota" 포함)', async () => {
    sdk.state.error = new sdk.errors.RateLimitError(429, 'slow down')
    await expect(runClaude({ parts: ['hi'] }, env)).rejects.toMatchObject({ status: 429, code: 'rate_limited', message: expect.stringContaining('429') })
    sdk.state.error = new sdk.errors.AuthenticationError(401, 'bad key')
    await expect(runClaude({ parts: ['hi'] }, env)).rejects.toMatchObject({ status: 502, code: 'upstream_auth' })
    sdk.state.error = new sdk.errors.BadRequestError(400, 'nope')
    await expect(runClaude({ parts: ['hi'] }, env)).rejects.toMatchObject({ status: 400, code: 'upstream_bad_request' })
    sdk.state.error = new sdk.errors.APIError(529, 'overloaded')
    await expect(runClaude({ parts: ['hi'] }, env)).rejects.toMatchObject({ status: 502, code: 'upstream_error' })
  })
})

describe('verifyAppUser', () => {
  const fakeFetch = (status, body) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }))

  it('Authorization 헤더가 없으면 401', async () => {
    await expect(verifyAppUser(undefined, {}, fakeFetch(200, 'admin'))).rejects.toMatchObject({ status: 401 })
    await expect(verifyAppUser('Basic abc', {}, fakeFetch(200, 'admin'))).rejects.toMatchObject({ status: 401 })
  })

  it('활성 사용자의 role 을 돌려주고, 사용자 토큰으로 current_app_role RPC 를 호출', async () => {
    const f = fakeFetch(200, 'grade3')
    await expect(verifyAppUser('Bearer jwt-abc', {}, f)).resolves.toBe('grade3')
    const [url, init] = f.mock.calls[0]
    expect(url).toMatch(/\/rest\/v1\/rpc\/current_app_role$/)
    expect(init.headers.Authorization).toBe('Bearer jwt-abc')
    expect(init.method).toBe('POST')
  })

  it('role 이 null(비활성/익명) 이면 403, 토큰 거부는 401, 그 외는 502', async () => {
    await expect(verifyAppUser('Bearer x', {}, fakeFetch(200, null))).rejects.toMatchObject({ status: 403 })
    await expect(verifyAppUser('Bearer x', {}, fakeFetch(401, {}))).rejects.toMatchObject({ status: 401 })
    await expect(verifyAppUser('Bearer x', {}, fakeFetch(500, {}))).rejects.toMatchObject({ status: 502 })
    await expect(verifyAppUser('Bearer x', {}, vi.fn(async () => { throw new Error('down') }))).rejects.toMatchObject({ status: 502 })
  })

  it('환경변수의 Supabase URL 을 우선 사용', async () => {
    const f = fakeFetch(200, 'admin')
    await verifyAppUser('Bearer x', { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_KEY: 'k' }, f)
    expect(f.mock.calls[0][0]).toBe('https://example.supabase.co/rest/v1/rpc/current_app_role')
    expect(f.mock.calls[0][1].headers.apikey).toBe('k')
  })
})

describe('POST /api/claude 핸들러', () => {
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
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => 'grade3' })))
  })

  it('POST 가 아니면 405', async () => {
    const res = await call({ method: 'GET' })
    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('POST')
  })

  it('로그인 토큰 없이는 401 이고 Claude 는 호출되지 않는다', async () => {
    const res = await call({ body: { parts: ['hi'] } })
    expect(res.statusCode).toBe(401)
    expect(sdk.state.lastRequest).toBeNull()
  })

  it('정상 호출 → { text, model }, 캐시 금지 헤더', async () => {
    const res = await call({ headers: { authorization: 'Bearer jwt' }, body: { parts: ['hi'] } })
    expect(res.statusCode).toBe(200)
    expect(res.payload).toEqual({ text: '{"a":1}', model: 'claude-opus-5-5' })
    expect(res.headers['Cache-Control']).toBe('no-store')
  })

  it('잘못된 입력은 400/413', async () => {
    const auth = { authorization: 'Bearer jwt' }
    expect((await call({ headers: auth, body: {} })).statusCode).toBe(400)
    expect((await call({ headers: auth, body: { parts: [] } })).statusCode).toBe(400)
    expect((await call({ headers: auth, body: { parts: Array(21).fill('x') } })).statusCode).toBe(400)
    expect((await call({ headers: auth, body: { parts: ['x'.repeat(600001)] } })).statusCode).toBe(413)
  })

  it('키 미설정이면 503 not_configured (클라이언트가 Gemini 오류를 그대로 보여주는 신호)', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const res = await call({ headers: { authorization: 'Bearer jwt' }, body: { parts: ['hi'] } })
    expect(res.statusCode).toBe(503)
    expect(res.payload.error.code).toBe('not_configured')
  })

  it('예상치 못한 오류의 내부 메시지는 노출하지 않는다', async () => {
    sdk.state.error = new Error('secret internal detail')
    const res = await call({ headers: { authorization: 'Bearer jwt' }, body: { parts: ['hi'] } })
    expect(res.statusCode).toBe(500)
    expect(JSON.stringify(res.payload)).not.toContain('secret internal detail')
  })
})
