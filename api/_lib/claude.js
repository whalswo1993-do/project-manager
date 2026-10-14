import Anthropic from '@anthropic-ai/sdk'
import { ApiError } from './errors.js'

// 기본 모델. Vercel 환경변수 ANTHROPIC_MODEL 로 바꿀 수 있다(예: 더 정밀한 claude-opus-5-5, 더 저렴한 claude-haiku-5-5).
// 일보/견적/마스터플랜 같은 구조화 추출 용도라 비용 대비 효율이 좋은 Sonnet 을 기본으로 쓴다.
export const DEFAULT_MODEL = 'claude-sonnet-5-5'
const DEFAULT_EFFORT = 'medium'
const MAX_TOKENS = 64000

// 서버측 refusal fallback 을 쓸 수 있는 모델 (Haiku 계열은 지원하지 않음)
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

const SYSTEM_PROMPT =
  '당신은 제조/설비 프로젝트 관리 시스템의 데이터 추출·분석 도우미입니다. ' +
  '사용자가 요구한 출력 형식을 정확히 지키세요. JSON을 요구하면 설명이나 마크다운 코드펜스 없이 순수 JSON만 응답하세요.'

// 기존 이름 유지(테스트/다른 모듈에서 사용). 실체는 공통 ApiError 와 같은 클래스다.
export const ClaudeError = ApiError

export function isClaudeConfigured(env = process.env) {
  return Boolean(env.ANTHROPIC_API_KEY)
}

/**
 * Gemini 의 generateContent 입력과 같은 모양의 parts 를 Claude content block 으로 변환한다.
 *   { text }                          -> text
 *   { inlineData: { data, mimeType } } -> image / document(PDF)
 */
export function toContentBlocks(parts) {
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new ClaudeError(400, 'bad_request', 'parts 가 비어 있습니다.')
  }
  return parts.map((part) => {
    if (typeof part === 'string') return { type: 'text', text: part }
    if (part && typeof part.text === 'string') return { type: 'text', text: part.text }
    const inline = part && part.inlineData
    if (inline && typeof inline.data === 'string' && typeof inline.mimeType === 'string') {
      if (inline.mimeType === 'application/pdf') {
        return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: inline.data } }
      }
      if (IMAGE_TYPES.has(inline.mimeType)) {
        return { type: 'image', source: { type: 'base64', media_type: inline.mimeType, data: inline.data } }
      }
      throw new ClaudeError(400, 'unsupported_media', `지원하지 않는 파일 형식입니다: ${inline.mimeType}`)
    }
    throw new ClaudeError(400, 'bad_request', '알 수 없는 parts 항목입니다.')
  })
}

function mapSdkError(err) {
  if (err instanceof ClaudeError) return err
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ClaudeError(502, 'upstream_auth', 'Claude API 키가 유효하지 않거나 권한이 없습니다. (401/403)')
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ClaudeError(429, 'rate_limited', 'Claude API 요청 한도에 도달했습니다. (429 quota)')
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new ClaudeError(400, 'upstream_bad_request', `Claude API 요청이 거부되었습니다: ${err.message}`)
  }
  if (err instanceof Anthropic.APIError) {
    return new ClaudeError(502, 'upstream_error', `Claude API 오류 (${err.status ?? 'network'}): ${err.message}`)
  }
  // 예상하지 못한 오류의 원문은 서버 로그에만 남기고, 사용자에게는 일반 문구만 보낸다.
  console.error('[claude] unexpected error:', err)
  return new ClaudeError(500, 'internal', '서버 오류가 발생했습니다.')
}

/**
 * Claude 를 호출해 텍스트를 돌려준다. 호출부(핸들러)와 분리해 두어 키만 있으면 단독 테스트할 수 있다.
 * @param {{ parts: unknown[], maxTokens?: number }} input
 * @param {Record<string, string | undefined>} [env]
 */
export async function runClaude({ parts, maxTokens }, env = process.env) {
  if (!isClaudeConfigured(env)) {
    throw new ClaudeError(503, 'not_configured', 'Claude API 키(ANTHROPIC_API_KEY)가 설정되지 않았습니다.')
  }

  const content = toContentBlocks(parts)
  const model = env.ANTHROPIC_MODEL || DEFAULT_MODEL
  const effort = env.ANTHROPIC_EFFORT || DEFAULT_EFFORT
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  const request = {
    model,
    max_tokens: Math.min(maxTokens || MAX_TOKENS, MAX_TOKENS),
    system: SYSTEM_PROMPT,
    output_config: { effort },
    messages: [{ role: 'user', content }],
  }
  // 정책상 응답이 거절되면 서버에서 다른 모델로 자동 재시도 (지원 모델 한정)
  if (FALLBACK_MODELS.has(model)) {
    request.betas = ['server-side-fallback-2026-07-01']
    request.fallbacks = 'default'
  }

  try {
    // 긴 출력에서 HTTP 타임아웃이 나지 않도록 스트리밍으로 받고 최종 메시지만 사용한다.
    const message = await client.beta.messages.stream(request).finalMessage()

    if (message.stop_reason === 'refusal') {
      throw new ClaudeError(422, 'refusal', 'Claude가 안전 정책상 이 요청에 응답하지 않았습니다.')
    }
    if (message.stop_reason === 'max_tokens') {
      throw new ClaudeError(502, 'truncated', 'Claude 응답이 길이 제한으로 중간에 끊겼습니다. 입력을 나눠서 다시 시도해주세요.')
    }

    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
    return { text, model: message.model, usage: message.usage }
  } catch (err) {
    throw mapSdkError(err)
  }
}
