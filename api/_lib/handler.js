import { ApiError } from './errors.js'
import { verifyAppUser } from './auth.js'

// /api/claude, /api/gemini 가 공유하는 엔드포인트 골격.
//   POST { parts: [{ text } | { inlineData: { data, mimeType } }] }  ->  { text, model }
// 유료 API 이므로 로그인한 활성 앱 사용자만 호출할 수 있다.

const MAX_PARTS = 20
const MAX_TEXT_CHARS = 600000

function validate(parts) {
  if (!Array.isArray(parts) || parts.length === 0 || parts.length > MAX_PARTS) {
    throw new ApiError(400, 'bad_request', `parts 는 1~${MAX_PARTS}개여야 합니다.`)
  }
  const textChars = parts.reduce((sum, p) => sum + (typeof p === 'string' ? p.length : (p?.text?.length || 0)), 0)
  if (textChars > MAX_TEXT_CHARS) {
    throw new ApiError(413, 'too_large', '입력 텍스트가 너무 깁니다.')
  }
}

/** @param {(parts: unknown[]) => Promise<{ text: string, model: string }>} run */
export function createAIHandler(run) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: { code: 'method_not_allowed', message: 'POST 만 지원합니다.' } })
    }

    try {
      await verifyAppUser(req.headers.authorization)
      const parts = req.body?.parts
      validate(parts)
      const { text, model } = await run(parts)
      return res.status(200).json({ text, model })
    } catch (err) {
      const known = err instanceof ApiError
      return res.status(known ? err.status : 500).json({
        error: { code: known ? err.code : 'internal', message: known ? err.message : '서버 오류가 발생했습니다.' },
      })
    }
  }
}
