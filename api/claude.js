import { ClaudeError, runClaude } from './_lib/claude.js'
import { verifyAppUser } from './_lib/auth.js'

// POST /api/claude  { parts: [{ text } | { inlineData: { data, mimeType } }] }  ->  { text, model }
// 브라우저에 Anthropic 키를 노출하지 않기 위한 서버측 프록시. 로그인한 앱 사용자만 호출할 수 있다.

const MAX_PARTS = 20
const MAX_TEXT_CHARS = 600000

function validate(parts) {
  if (!Array.isArray(parts) || parts.length === 0 || parts.length > MAX_PARTS) {
    throw new ClaudeError(400, 'bad_request', `parts 는 1~${MAX_PARTS}개여야 합니다.`)
  }
  const textChars = parts.reduce((sum, p) => sum + (typeof p === 'string' ? p.length : (p?.text?.length || 0)), 0)
  if (textChars > MAX_TEXT_CHARS) {
    throw new ClaudeError(413, 'too_large', '입력 텍스트가 너무 깁니다.')
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST 만 지원합니다.' } })
  }

  try {
    await verifyAppUser(req.headers.authorization)
    const parts = req.body?.parts
    validate(parts)
    const { text, model } = await runClaude({ parts })
    return res.status(200).json({ text, model })
  } catch (err) {
    const status = err instanceof ClaudeError ? err.status : 500
    const code = err instanceof ClaudeError ? err.code : 'internal'
    const message = err instanceof ClaudeError ? err.message : '서버 오류가 발생했습니다.'
    return res.status(status).json({ error: { code, message } })
  }
}
