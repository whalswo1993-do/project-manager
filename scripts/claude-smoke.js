// Claude 연결 스모크 테스트 — 실제 Anthropic API 를 한 번 호출해 키/모델/요청 형태가 맞는지 확인한다.
// (서버 함수 api/_lib/claude.js 의 runClaude 를 그대로 사용하므로, 여기서 성공하면 /api/claude 도 같은 요청을 보낸다.)
//
//   PowerShell:  $env:ANTHROPIC_API_KEY = 'sk-ant-...'; node scripts/claude-smoke.js
//   끝나면:      Remove-Item Env:ANTHROPIC_API_KEY
//
// 선택: $env:ANTHROPIC_MODEL = 'claude-sonnet-5-5' 로 다른 모델도 확인할 수 있다. 호출 비용은 몇 원 이하.
import { runClaude, isClaudeConfigured, DEFAULT_MODEL } from '../api/_lib/claude.js'

if (!isClaudeConfigured()) {
  console.error('ANTHROPIC_API_KEY 가 설정되어 있지 않습니다. (위 사용법 참고)')
  process.exit(2)
}

const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL
console.log(`모델: ${model}`)

const t0 = Date.now()
try {
  const { text, model: served, usage } = await runClaude({
    parts: ['다음 JSON만 그대로 출력하세요(설명, 코드펜스 금지): {"ok": true, "n": 3}'],
    maxTokens: 2000,
  })
  console.log(`응답 모델: ${served}  (${Date.now() - t0}ms)`)
  console.log(`응답: ${text.trim()}`)
  console.log(`토큰: 입력 ${usage?.input_tokens} / 출력 ${usage?.output_tokens}`)

  let parsed
  try { parsed = JSON.parse(text.trim()) } catch { /* 아래에서 보고 */ }
  if (parsed && parsed.ok === true && parsed.n === 3) {
    console.log('\n✅ 성공: 키, 모델, 요청 형태(스트리밍/effort/fallbacks)가 모두 정상입니다.')
  } else {
    console.log('\n⚠️ API 호출은 성공했지만 응답이 요청한 JSON과 다릅니다. 위 응답을 확인하세요.')
    process.exitCode = 1
  }
} catch (err) {
  console.error(`\n❌ 실패 [${err.status ?? '-'} ${err.code ?? 'error'}]: ${err.message}`)
  process.exitCode = 1
}
