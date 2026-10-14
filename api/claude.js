import { runClaude } from './_lib/claude.js'
import { createAIHandler } from './_lib/handler.js'

// POST /api/claude — 브라우저에 Anthropic 키를 노출하지 않기 위한 서버측 프록시 (골격은 _lib/handler.js)
export default createAIHandler((parts) => runClaude({ parts }))
