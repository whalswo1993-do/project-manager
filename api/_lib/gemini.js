import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  GoogleGenerativeAIRequestInputError,
  GoogleGenerativeAIResponseError,
} from '@google/generative-ai'
import { ApiError } from './errors.js'

// 서버측 Gemini 호출. 키(GEMINI_API_KEY)는 서버 환경변수에만 있고 브라우저로 내려가지 않는다.
// 모델은 GEMINI_MODEL 환경변수로 바꿀 수 있다(기본값은 기존 앱이 쓰던 모델).
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'

export function isGeminiConfigured(env = process.env) {
  return Boolean(env.GEMINI_API_KEY)
}

function validateParts(parts) {
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new ApiError(400, 'bad_request', 'parts 가 비어 있습니다.')
  }
  for (const part of parts) {
    if (typeof part === 'string') continue
    if (part && typeof part.text === 'string') continue
    const inline = part && part.inlineData
    if (inline && typeof inline.data === 'string' && typeof inline.mimeType === 'string') {
      if (inline.mimeType.startsWith('image/') || inline.mimeType === 'application/pdf') continue
      throw new ApiError(400, 'unsupported_media', `지원하지 않는 파일 형식입니다: ${inline.mimeType}`)
    }
    throw new ApiError(400, 'bad_request', '알 수 없는 parts 항목입니다.')
  }
}

// 화면(App/IssueManagement/Quotations)은 오류 문구에 "429"/"quota", "403"/"API_KEY_INVALID" 가 있는지 보고
// 안내 문구를 고른다. 서버 경유에서도 그 문구가 그대로 전달되도록 메시지를 구성한다.
function mapGeminiError(err) {
  if (err instanceof ApiError) return err

  if (err instanceof GoogleGenerativeAIFetchError) {
    const status = err.status
    const text = String(err.message || '')
    if (status === 429) {
      return new ApiError(429, 'rate_limited', `Gemini 요청 한도에 도달했습니다. (429 quota) ${text}`)
    }
    if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid/i.test(text)) {
      return new ApiError(502, 'upstream_auth', 'Gemini API 키가 유효하지 않거나 권한이 없습니다. (403 API_KEY_INVALID)')
    }
    if (status === 400) {
      return new ApiError(400, 'upstream_bad_request', `Gemini 요청이 거부되었습니다: ${text}`)
    }
    return new ApiError(502, 'upstream_error', `Gemini API 오류 (${status ?? 'network'}): ${text}`)
  }

  if (err instanceof GoogleGenerativeAIResponseError) {
    // 안전 필터로 응답이 차단된 경우 등
    return new ApiError(422, 'blocked', `Gemini가 응답을 생성하지 않았습니다: ${err.message}`)
  }
  if (err instanceof GoogleGenerativeAIRequestInputError) {
    return new ApiError(400, 'bad_request', `Gemini 입력 오류: ${err.message}`)
  }

  // 예상하지 못한 오류의 원문은 서버 로그에만 남기고, 사용자에게는 일반 문구만 보낸다.
  console.error('[gemini] unexpected error:', err)
  return new ApiError(500, 'internal', '서버 오류가 발생했습니다.')
}

/**
 * @param {{ parts: unknown[] }} input  Gemini generateContent 와 같은 parts
 * @param {Record<string, string | undefined>} [env]
 */
export async function runGemini({ parts }, env = process.env) {
  if (!isGeminiConfigured(env)) {
    throw new ApiError(503, 'not_configured', 'Gemini API 키(GEMINI_API_KEY)가 서버에 설정되지 않았습니다.')
  }
  validateParts(parts)

  const modelName = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
  try {
    const model = new GoogleGenerativeAI(env.GEMINI_API_KEY).getGenerativeModel({ model: modelName })
    const result = await model.generateContent(parts)
    return { text: result.response.text(), model: modelName }
  } catch (err) {
    throw mapGeminiError(err)
  }
}
