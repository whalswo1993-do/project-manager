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

const NOT_CONFIGURED = [503, { error: { code: 'not_configured', message: 'no key' } }]

const directOk = (text) => geminiGenerate.mockResolvedValue({ response: { text: () => text } })
const directFail = (message) => geminiGenerate.mockRejectedValue(new Error(message))

/** /api/gemini, /api/claude 를 각각 [status, body] 로 응답하는 가짜 서버. 기본값은 둘 다 "키 미설정". */
function stubServers({ gemini = NOT_CONFIGURED, claude = NOT_CONFIGURED } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const [status, body] = url === '/api/gemini' ? gemini : claude
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  }))
}
const urlsCalled = () => fetch.mock.calls.map(([url]) => url)

beforeEach(() => {
  geminiGenerate.mockReset()
  getSession.mockResolvedValue({ data: { session: { access_token: 'jwt-123' } } })
  vi.stubEnv('VITE_GEMINI_API_KEY', 'gem-key')
  vi.stubEnv('VITE_AI_PROVIDER', '')
  stubServers()
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

  it('isAIConfigured: 서버 키 여부를 브라우저가 알 수 없으므로 항상 true (키 없음은 호출 시 안내)', () => {
    vi.stubEnv('VITE_AI_PROVIDER', 'gemini')
    vi.stubEnv('VITE_GEMINI_API_KEY', '')
    expect(isAIConfigured()).toBe(true)
  })
})

describe('Gemini 호출 경로: 서버 우선, 브라우저 키는 안전망', () => {
  it('서버(/api/gemini)가 성공하면 브라우저 키로 직접 호출하지 않는다 (키가 브라우저에서 쓰이지 않음)', async () => {
    stubServers({ gemini: [200, { text: 'from server', model: 'gemini-3.8-flash' }] })
    await expect(generateAIText('prompt')).resolves.toBe('from server')
    expect(geminiGenerate).not.toHaveBeenCalled()
    expect(urlsCalled()).toEqual(['/api/gemini'])
    const [, init] = fetch.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer jwt-123')
    expect(JSON.parse(init.body)).toEqual({ parts: ['prompt'] })
  })

  it('서버에 Gemini 키가 없으면(503) 기존처럼 브라우저 키로 직접 호출', async () => {
    directOk('{"ok":1}')
    await expect(generateAIText('prompt')).resolves.toBe('{"ok":1}')
    expect(urlsCalled()).toEqual(['/api/gemini'])
    expect(geminiGenerate).toHaveBeenCalledWith(['prompt'])
  })

  it('서버 로그인 세션이 없으면(테스트 계정 등) 서버 호출 없이 브라우저 키로 직접 호출', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    directOk('direct')
    await expect(generateAIText('prompt')).resolves.toBe('direct')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('개발 서버(/api 없음, HTML 응답)이면 브라우저 키로 직접 호출', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error('not json') } })))
    directOk('direct')
    await expect(generateAIText('prompt')).resolves.toBe('direct')
  })

  it('파일이 너무 커서 서버가 413 이면 브라우저 키로 직접 호출', async () => {
    stubServers({ gemini: [413, null] })
    directOk('direct big file')
    await expect(generateAIText('prompt')).resolves.toBe('direct big file')
  })

  it('브라우저 키가 없는데 파일이 커서 413 이면 "키 없음"이 아니라 파일 크기 안내', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', '')
    vi.stubEnv('VITE_AI_PROVIDER', 'gemini')
    stubServers({ gemini: [413, null] })
    const err = await generateAIText('p', { notConfiguredMessage: '키 없음 안내' }).catch((e) => e)
    expect(err.code).toBe('too_large')
    expect(err.message).toMatch(/3MB/)
    expect(err.message).not.toMatch(/키 없음/)
  })

  it('parts(이미지 등)는 변형 없이 그대로 전달', async () => {
    const parts = [{ inlineData: { data: 'AAA', mimeType: 'image/png' } }, 'prompt']
    stubServers({ gemini: [200, { text: 'ok' }] })
    await generateAIText(parts)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ parts })
    stubServers()
    directOk('x')
    await generateAIText(parts)
    expect(geminiGenerate).toHaveBeenCalledWith(parts)
  })

  it('서버가 429 를 주면 같은 키/한도이므로 직접 재시도하지 않는다', async () => {
    stubServers({ gemini: [429, { error: { code: 'rate_limited', message: 'Gemini 요청 한도 (429 quota)' } }], claude: [503, NOT_CONFIGURED[1]] })
    vi.stubEnv('VITE_AI_PROVIDER', 'gemini')
    await expect(generateAIText('p')).rejects.toThrow(/429 quota/)
    expect(geminiGenerate).not.toHaveBeenCalled()
  })

  it('서버도 브라우저 키도 없으면 안내 문구', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', '')
    vi.stubEnv('VITE_AI_PROVIDER', 'gemini')
    await expect(generateAIText('p', { notConfiguredMessage: '키 없음 안내' })).rejects.toThrow('키 없음 안내')
  })
})

describe('auto: Gemini → Claude', () => {
  it('Gemini 가 성공하면 Claude 서버는 호출하지 않는다 — 기존 동작과 동일', async () => {
    directOk('{"ok":1}')
    await expect(generateAIText('prompt')).resolves.toBe('{"ok":1}')
    expect(urlsCalled()).not.toContain('/api/claude')
  })

  it('Gemini 실패 + Claude 성공 → Claude 응답', async () => {
    directFail('[429 Too Many Requests] quota exceeded')
    stubServers({ claude: [200, { text: 'from claude', model: 'claude-sonnet-5-5' }] })
    await expect(generateAIText('prompt')).resolves.toBe('from claude')
    const claudeCall = fetch.mock.calls.find(([url]) => url === '/api/claude')
    expect(claudeCall[1].headers.Authorization).toBe('Bearer jwt-123')
    expect(JSON.parse(claudeCall[1].body)).toEqual({ parts: ['prompt'] })
  })

  it('Gemini 서버가 429 → Claude 로 전환 (브라우저 키 재시도 없음)', async () => {
    stubServers({
      gemini: [429, { error: { code: 'rate_limited', message: 'Gemini 요청 한도 (429 quota)' } }],
      claude: [200, { text: 'claude saved it' }],
    })
    await expect(generateAIText('prompt')).resolves.toBe('claude saved it')
    expect(geminiGenerate).not.toHaveBeenCalled()
  })

  it('Gemini 실패 + Claude 미설정(503) → 예전처럼 Gemini 오류를 그대로 전달 (호출부의 429/quota 안내 유지)', async () => {
    directFail('[429 Too Many Requests] quota exceeded')
    await expect(generateAIText('prompt')).rejects.toThrow(/429.*quota/)
  })

  it('Gemini 실패 + 서버 로그인 없음 → Gemini 오류 전달', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    directFail('[403] API_KEY_INVALID')
    await expect(generateAIText('prompt')).rejects.toThrow(/API_KEY_INVALID/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('둘 다 실제로 실패하면 두 원인을 모두 보여준다', async () => {
    directFail('gemini boom')
    stubServers({ claude: [429, { error: { code: 'rate_limited', message: 'Claude API 요청 한도에 도달했습니다. (429 quota)' } }] })
    const err = await generateAIText('prompt').catch((e) => e)
    expect(err.message).toMatch(/429 quota/)
    expect(err.message).toMatch(/gemini boom/)
  })

  it('Gemini 를 쓸 수 없으면(서버·브라우저 키 모두 없음) 곧바로 Claude', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', '')
    stubServers({ claude: [200, { text: 'claude only' }] })
    await expect(generateAIText('prompt')).resolves.toBe('claude only')
    expect(geminiGenerate).not.toHaveBeenCalled()
  })

  it('키가 하나도 없으면 호출부가 준 안내 문구', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', '')
    await expect(generateAIText('p', { notConfiguredMessage: '키 없음 안내' })).rejects.toThrow('키 없음 안내')
  })
})

describe('역할 때문에 막힌 경우 (403 ai_not_allowed)', () => {
  const NOT_ALLOWED = [403, { error: { code: 'ai_not_allowed', message: 'AI 분석은 Grade 2.5 이상 계정만 사용할 수 있습니다.' } }]

  it('auto: 브라우저 Gemini 키로 직접 호출하지 않고 Claude 로도 전환하지 않으며, 서버 안내 문구를 그대로 보여준다', async () => {
    stubServers({ gemini: NOT_ALLOWED, claude: NOT_ALLOWED })
    const err = await generateAIText('p', { notConfiguredMessage: '키 없음 안내' }).catch((e) => e)
    expect(err.code).toBe('ai_not_allowed')
    expect(err.message).toBe('AI 분석은 Grade 2.5 이상 계정만 사용할 수 있습니다.')
    expect(geminiGenerate).not.toHaveBeenCalled()
    expect(urlsCalled()).toEqual(['/api/gemini'])
  })

  it('gemini 고정: 브라우저 키가 있어도 직접 호출하지 않는다', async () => {
    vi.stubEnv('VITE_AI_PROVIDER', 'gemini')
    stubServers({ gemini: NOT_ALLOWED })
    await expect(generateAIText('p')).rejects.toMatchObject({ code: 'ai_not_allowed' })
    expect(geminiGenerate).not.toHaveBeenCalled()
  })

  it('claude 고정: 안내 문구를 그대로 보여준다', async () => {
    vi.stubEnv('VITE_AI_PROVIDER', 'claude')
    stubServers({ claude: NOT_ALLOWED })
    await expect(generateAIText('p')).rejects.toMatchObject({ code: 'ai_not_allowed', message: expect.stringContaining('Grade 2.5') })
  })
})

describe('gemini / claude 고정', () => {
  it('gemini 고정: 실패해도 Claude 로 가지 않는다', async () => {
    vi.stubEnv('VITE_AI_PROVIDER', 'gemini')
    directFail('quota')
    await expect(generateAIText('p')).rejects.toThrow('quota')
    expect(urlsCalled()).not.toContain('/api/claude')
  })

  it('claude 고정: Gemini 를 쓰지 않는다', async () => {
    vi.stubEnv('VITE_AI_PROVIDER', 'claude')
    stubServers({ claude: [200, { text: 'ok' }] })
    await expect(generateAIText('p')).resolves.toBe('ok')
    expect(geminiGenerate).not.toHaveBeenCalled()
    expect(urlsCalled()).toEqual(['/api/claude'])
  })

  it('claude 고정: 서버 키 미설정이면 안내 문구', async () => {
    vi.stubEnv('VITE_AI_PROVIDER', 'claude')
    await expect(generateAIText('p', { notConfiguredMessage: '키 없음' })).rejects.toThrow('키 없음')
  })
})
