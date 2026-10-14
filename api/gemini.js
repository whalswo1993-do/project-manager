import { runGemini } from './_lib/gemini.js'
import { createAIHandler } from './_lib/handler.js'

// POST /api/gemini — 브라우저에 Gemini 키를 노출하지 않기 위한 서버측 프록시 (골격은 _lib/handler.js)
export default createAIHandler((parts) => runGemini({ parts }))
