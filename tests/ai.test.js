import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ai.js 의 외부 의존성은 모두 모의(mock) 처리한다 — 실제 API 키나 네트워크 없이 라우팅 규칙만 검증한다.
const geminiGenerate = vi.fn()
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: geminiGenerate }
    }
  },
}))

const getSession = vi.fn()
vi.mock('../src/supabase', () => ({ supabase: { auth: { getSession: (...a) => getSession(...a) } } }))
vi.mock('../src/authService', () => ({ ensureSupabaseAuth: vi.fn(async () => true) }))

const { generateAIText, isAIConfigured, getAIProvider } = await import('../src/ai.js')

const geminiOk = (text) => geminiGenerate.mockResolvedValue({ response: { text: () => text } })
const geminiFail = (message) => geminiGenerate.mockRejectedValue(new Error(message))
const claudeResponds = (status, body) =>
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })))

beforeEach(() => {
  geminiGenerate.mockReset()
  getSession.mockResolvedValue({ data: { session: { access_token: 'jwt-123' } } })
  vi.stubEnv('VITE_GEMINI_API_KEY', 'gem-key')
  vi.stubEnv('VITE_AI_PROVIDER', '')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('provider 선택', () => {
  it('기본값은 auto', () => {
    expect(getAIProvider()).toBe('auto')
    vi.stubEnv('VITE_AI_PROVIDER', 'bogus')
    expect(getAIProvider()).toBe('auto')
    vi.stubEnv('VITE_AI_PROVIDER', 'CLAUDE')
    expect(getAIProvider()).toBe('claude')
  })

  it('isAIConfigured: gemini 전용이면 키가 있어야 true, 그 외에는 낙관적으로 true', () => {
    vi.stubEnv('VITE_AI_PROVIDER', 'gemini')
    expect(isAIConfigured()).toBe(true)
    vi.stubEnv('VITE_GEMINI_API_KEY', '')
    expect(isAIConfigured()).toBe(false)
    vi.stubEnv('VITE_AI_PROVIDER', 'auto')
    expect(isAIConfigured()).toBe(true)
  })
})

describe('auto (기본)', () => {
  it('Gemini 가 성공하면 Claude 서버는 호출하지 않는다 — 기존 동작과 동일', async () => {
    geminiOk('{"ok":1}')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(generateAIText('prompt')).resolves.toBe('{"ok":1}')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(geminiGenerate).toHaveBeenCalledWith(['prompt'])
  })

  it('문자열/배열 입력 모두 Gemini 에는 배열로 전달 (parts 보존)', async () => {
    geminiOk('x')
    const parts = [{ inlineData: { data: 'AAA', mimeType: 'image/png' } }, 'prompt']
    await generateAIText(parts)
    expect(geminiGenerate).toHaveBeenCalledWith(parts)
  })

  it('Gemini 실패 + Claude 성공 → Claude 응답', async () => {
    geminiFail('[429 Too Many Requests] quota exceeded')
    claudeResponds(200, { text: 'from claude', model: 'claude-opus-5-5' })
    await expect(generateAIText('prompt')).resolves.toBe('from claude')
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/claude')
    expect(init.headers.Authorization).toBe('Bearer jwt-123')
    expect(JSON.parse(init.body)).toEqual({ parts: ['prompt'] })
  })

  it('Gemini 실패 + Claude 미설정(503) → 예전처럼 Gemini 오류를 그대로 전달 (호출부의 429/quota 안내 유지)', async () => {
    geminiFail('[429 Too Many Requests] quota exceeded')
    claudeResponds(503, { error: { code: 'not_configured', message: 'no key' } })
    await expect(generateAIText('prompt')).rejects.toThrow(/429.*quota/)
  })

  it('Gemini 실패 + 서버 로그인 없음 → Gemini 오류 전달', async () => {
    geminiFail('[403] API_KEY_INVALID')
    getSession.mockResolvedValue({ data: { session: null } })
    vi.stubGlobal('fetch', vi.fn())
    await expect(generateAIText('prompt')).rejects.toThrow(/API_KEY_INVALID/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('Gemini 실패 + 개발 서버(/api 없음, HTML 응답) → Gemini 오류 전달', async () => {
    geminiFail('network down')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error('not json') } })))
    await expect(generateAIText('prompt')).rejects.toThrow(/network down/)
  })

  it('둘 다 실제로 실패하면 두 원인을 모두 보여준다', async () => {
    geminiFail('gemini boom')
    claudeResponds(429, { error: { code: 'rate_limited', message: 'Claude API 요청 한도에 도달했습니다. (429 quota)' } })
    const err = await generateAIText('prompt').catch((e) => e)
    expect(err.message).toMatch(/429 quota/)
    expect(err.message).toMatch(/gemini boom/)
  })

  it('Gemini 키가 없으면 곧바로 Claude', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', '')
    claudeResponds(200, { text: 'claude only' })
    await expect(generateAIText('prompt')).resolves.toBe('claude only')
    expect(geminiGenerate).not.toHaveBeenCalled()
  })

  it('키가 하나도 없으면 호출부가 준 안내 문구', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', '')
    claudeResponds(503, { error: { code: 'not_configured', message: 'no key' } })
    await expect(generateAIText('p', { notConfiguredMessage: '키 없음 안내' })).rejects.toThrow('키 없음 안내')
  })
})

describe('gemini / claude 고정', () => {
  it('gemini: 실패해도 Claude 로 가지 않는다', async () => {
    vi.stubEnv('VITE_AI_PROVIDER', 'gemini')
    geminiFail('quota')
    vi.stubGlobal('fetch', vi.fn())
    await expect(generateAIText('p')).rejects.toThrow('quota')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('gemini: 키가 없으면 안내 문구', async () => {
    vi.stubEnv('VITE_AI_PROVIDER', 'gemini')
    vi.stubEnv('VITE_GEMINI_API_KEY', '')
    await expect(generateAIText('p', { notConfiguredMessage: '키 없음' })).rejects.toThrow('키 없음')
  })

  it('claude: Gemini 를 쓰지 않는다', async () => {
    vi.stubEnv('VITE_AI_PROVIDER', 'claude')
    claudeResponds(200, { text: 'ok' })
    await expect(generateAIText('p')).resolves.toBe('ok')
    expect(geminiGenerate).not.toHaveBeenCalled()
  })

  it('claude: 서버 키 미설정이면 안내 문구', async () => {
    vi.stubEnv('VITE_AI_PROVIDER', 'claude')
    claudeResponds(503, { error: { code: 'not_configured', message: 'no key' } })
    await expect(generateAIText('p', { notConfiguredMessage: '키 없음' })).rejects.toThrow('키 없음')
  })
})
