// Gemini 서버 모듈 스모크 테스트 — 실제 Gemini API 를 한 번 호출해 키/모델/요청 형태가 맞는지 확인한다.
// (api/_lib/gemini.js 의 runGemini 를 그대로 사용하므로, 여기서 성공하면 /api/gemini 도 같은 요청을 보낸다.)
//
//   로컬 .env.local 의 키로:  node --env-file=.env.local scripts/gemini-smoke.js
//   키를 직접 지정:           $env:GEMINI_API_KEY = '...'; node scripts/gemini-smoke.js   (끝나면 $env:GEMINI_API_KEY = $null)
//
// GEMINI_API_KEY 가 없으면 VITE_GEMINI_API_KEY 를 대신 사용한다(마이그레이션 중 같은 키를 쓰기 때문). 키 값은 출력하지 않는다.
import { runGemini, isGeminiConfigured, DEFAULT_GEMINI_MODEL } from '../api/_lib/gemini.js'

const env = { ...process.env }
if (!env.GEMINI_API_KEY && env.VITE_GEMINI_API_KEY) env.GEMINI_API_KEY = env.VITE_GEMINI_API_KEY

if (!isGeminiConfigured(env)) {
  console.error('GEMINI_API_KEY(또는 VITE_GEMINI_API_KEY)가 없습니다. (위 사용법 참고)')
  process.exit(2)
}

console.log(`모델: ${env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL}`)
const t0 = Date.now()
try {
  const { text, model } = await runGemini({ parts: ['다음 JSON만 그대로 출력하세요(설명, 코드펜스 금지): {"ok": true, "n": 3}'] }, env)
  console.log(`응답 모델: ${model}  (${Date.now() - t0}ms)`)
  console.log(`응답: ${text.trim()}`)
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  let parsed
  try { parsed = JSON.parse(cleaned) } catch { /* 아래에서 보고 */ }
  if (parsed && parsed.ok === true && parsed.n === 3) {
    console.log('\n✅ 성공: 서버측 Gemini 호출(키, 모델, 요청 형태)이 정상입니다.')
  } else {
    console.log('\n⚠️ API 호출은 성공했지만 응답이 요청한 JSON과 다릅니다. 위 응답을 확인하세요.')
    process.exitCode = 1
  }
} catch (err) {
  console.error(`\n❌ 실패 [${err.status ?? '-'} ${err.code ?? 'error'}]: ${err.message}`)
  process.exitCode = 1
}
