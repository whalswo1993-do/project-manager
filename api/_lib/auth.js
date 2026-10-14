import { ApiError } from './errors.js'

// src/supabase.js 와 같은 공개 값(URL, publishable key). 환경변수가 있으면 우선한다.
const FALLBACK_URL = 'https://tebtuzxafkymlplmlhzu.supabase.co'
const FALLBACK_KEY = 'sb_publishable_grHTjPexU7_f9M8w4IrEYQ_o7_gx160'

/**
 * Authorization: Bearer <Supabase access token> 을 검증하고, 활성 상태인 앱 사용자의 role 을 돌려준다.
 * 유료 API 를 호출하므로 비로그인/비활성 사용자는 거부한다.
 * (DB 함수 current_app_role() 은 auth.uid() 기준 active=true 인 프로필의 role 을 반환, 아니면 null)
 */
export async function verifyAppUser(authorization, env = process.env, fetchImpl = fetch) {
  const match = /^Bearer\s+(.+)$/i.exec(authorization || '')
  if (!match) throw new ApiError(401, 'unauthenticated', '로그인이 필요합니다.')

  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || FALLBACK_URL
  const key = env.VITE_SUPABASE_KEY || env.SUPABASE_KEY || FALLBACK_KEY

  let res
  try {
    res = await fetchImpl(`${url}/rest/v1/rpc/current_app_role`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${match[1]}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
  } catch {
    throw new ApiError(502, 'auth_unreachable', '로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.')
  }

  if (res.status === 401 || res.status === 403) {
    throw new ApiError(401, 'unauthenticated', '로그인 세션이 유효하지 않습니다. 다시 로그인해주세요.')
  }
  if (!res.ok) throw new ApiError(502, 'auth_error', `로그인 상태 확인 오류 (${res.status})`)

  const role = await res.json()
  if (!role) throw new ApiError(403, 'forbidden', '사용 권한이 없는 계정입니다.')
  return role
}
