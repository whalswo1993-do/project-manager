import { beforeEach, describe, expect, it, vi } from 'vitest'

// 인증 모듈은 모두 서버(profiles) 기반이다. supabase 클라이언트는 모의 처리하고 로직만 검증한다.
const db = vi.hoisted(() => ({
  rpc: vi.fn(),
  updates: [],
  updateError: null,
  getSession: vi.fn(),
  updateUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}))

vi.mock('../src/supabase.js', () => ({
  supabase: {
    rpc: (...args) => db.rpc(...args),
    auth: {
      getSession: (...a) => db.getSession(...a),
      updateUser: (...a) => db.updateUser(...a),
      resetPasswordForEmail: (...a) => db.resetPasswordForEmail(...a),
    },
    from: () => ({
      update: (patch) => ({
        eq: async (col, val) => {
          db.updates.push({ patch, col, val })
          return { error: db.updateError }
        },
      }),
    }),
  },
}))

const {
  validateSignupProfile,
  getUserDisplayName,
  getUserTeam,
  formatLastAccessTime,
  importLegacyLocalProfiles,
  purgeLegacyLocalAuthData,
  recordUserAccess,
  deleteUserAccount,
  requestPasswordReset,
  updateUserPassword,
  ensureSupabaseAuth,
} = await import('../src/authService.js')

// 최소한의 localStorage 대역
function installLocalStorage(initial = {}) {
  const store = { ...initial }
  vi.stubGlobal('localStorage', {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] },
  })
  return store
}

beforeEach(() => {
  db.rpc.mockReset().mockResolvedValue({ error: null })
  db.updates.length = 0
  db.updateError = null
  db.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 't' } } })
  db.updateUser.mockReset().mockResolvedValue({ error: null })
  db.resetPasswordForEmail.mockReset().mockResolvedValue({ error: null })
  vi.stubGlobal('window', { location: { origin: 'https://x.test', pathname: '/' } })
  installLocalStorage()
})

describe('validateSignupProfile — 이름과 소속팀은 필수', () => {
  it.each([
    ['', 'PM팀', /이름/],
    ['   ', 'PM팀', /이름/],
    ['홍', 'PM팀', /2자/],
    ['홍길동', '', /소속팀/],
    ['홍길동', '  ', /소속팀/],
    ['홍길동', '팀', /2자/],
    [undefined, undefined, /이름/],
  ])('이름=%j 팀=%j 는 거부', (name, team, message) => {
    expect(validateSignupProfile(name, team)).toMatch(message)
  })

  it('정상 입력(앞뒤 공백 허용)은 통과', () => {
    expect(validateSignupProfile('홍길동', 'PM팀')).toBe('')
    expect(validateSignupProfile('  홍길동 ', ' 설계팀 ')).toBe('')
  })
})

describe('getUserDisplayName / getUserTeam — 서버 프로필이 우선', () => {
  it('이름+팀', () => {
    expect(getUserDisplayName('a@twgroup.co.kr', { name: '홍길동', team: 'PM팀' })).toBe('홍길동 (PM팀)')
    expect(getUserTeam('a@twgroup.co.kr', { name: '홍길동', team: 'PM팀' })).toBe('PM팀')
  })

  it('이름만 / 팀만 / 아무것도 없으면 이메일', () => {
    expect(getUserDisplayName('a@twgroup.co.kr', { name: '홍길동' })).toBe('홍길동')
    expect(getUserDisplayName('a@twgroup.co.kr', { team: '설계팀' })).toBe('a@twgroup.co.kr (설계팀)')
    expect(getUserDisplayName('a@twgroup.co.kr', {})).toBe('a@twgroup.co.kr')
    expect(getUserDisplayName('A@TWGROUP.CO.KR')).toBe('a@twgroup.co.kr')
  })

  it('프로필이 없으면 가입 메타데이터를 사용', () => {
    const meta = { user_metadata: { name: '김철수', team: '제어팀' } }
    expect(getUserDisplayName('b@twgroup.co.kr', meta)).toBe('김철수 (제어팀)')
    expect(getUserTeam('b@twgroup.co.kr', meta)).toBe('제어팀')
  })

  it('서버 프로필 값이 메타데이터보다 우선 (관리자가 고친 값)', () => {
    const merged = { name: '수정된이름', team: '수정팀', user_metadata: { name: '옛이름', team: '옛팀' } }
    expect(getUserDisplayName('c@twgroup.co.kr', merged)).toBe('수정된이름 (수정팀)')
  })

  it('이메일도 이름도 없으면 "사용자"', () => {
    expect(getUserDisplayName(null, null)).toBe('사용자')
  })
})

describe('importLegacyLocalProfiles — 관리자 브라우저의 예전 이름/팀을 서버로 이관', () => {
  const KEY = 'tw_custom_user_profiles_v1'
  const DONE = 'tw_custom_profiles_imported_v1'
  const server = [
    { id: 'u1', email: 'a@twgroup.co.kr', name: null, team: null },
    { id: 'u2', email: 'b@twgroup.co.kr', name: '서버이름', team: null },
    { id: 'u3', email: 'c@twgroup.co.kr', name: '서버', team: '서버팀' },
    { id: 'u4', email: 'd@twgroup.co.kr', name: null, team: null },
  ]
  const local = {
    'a@twgroup.co.kr': { name: '로컬A', team: 'PM팀' },
    'b@twgroup.co.kr': { name: '로컬B', department: '설계팀' },
    'c@twgroup.co.kr': { name: '로컬C', team: '로컬팀' },
  }

  it('서버에 비어 있는 항목만 채우고, 있는 값은 덮어쓰지 않는다', async () => {
    const store = installLocalStorage({ [KEY]: JSON.stringify(local) })
    const count = await importLegacyLocalProfiles(server)
    expect(count).toBe(2)
    expect(db.updates).toEqual([
      { patch: { name: '로컬A', team: 'PM팀' }, col: 'id', val: 'u1' },
      { patch: { team: '설계팀' }, col: 'id', val: 'u2' },
    ])
    expect(store[DONE]).toBe('1')
  })

  it('한 번 이관하면 다시 실행하지 않는다', async () => {
    installLocalStorage({ [KEY]: JSON.stringify(local), [DONE]: '1' })
    expect(await importLegacyLocalProfiles(server)).toBe(0)
    expect(db.updates).toHaveLength(0)
  })

  it('저장 실패가 있으면 완료 표시를 남기지 않아 다음에 다시 시도', async () => {
    const store = installLocalStorage({ [KEY]: JSON.stringify(local) })
    db.updateError = { message: 'denied' }
    expect(await importLegacyLocalProfiles(server)).toBe(0)
    expect(store[DONE]).toBeUndefined()
  })

  it('로컬 데이터가 없으면 완료로 표시하고 아무것도 하지 않는다', async () => {
    const store = installLocalStorage()
    expect(await importLegacyLocalProfiles(server)).toBe(0)
    expect(store[DONE]).toBe('1')
  })

  it('깨진 JSON 이어도 예외 없이 0', async () => {
    installLocalStorage({ [KEY]: '{not json' })
    expect(await importLegacyLocalProfiles(server)).toBe(0)
  })
})

describe('purgeLegacyLocalAuthData — 예전 방식이 남긴 민감 값 삭제', () => {
  it('가짜 세션/리프레시 토큰/접속 기록/테스트 프로필은 지우고, 이관 전 이름·팀 데이터는 남긴다', () => {
    const store = installLocalStorage({
      tw_bg_refresh_token: 'x',
      tw_test_active_session: 'x',
      tw_test_user_profiles_v3: 'x',
      tw_deleted_user_accounts: 'x',
      tw_user_last_access_v1: 'x',
      tw_custom_user_profiles_v1: '{"a":1}',
      pm_theme_mode: 'dark',
    })
    purgeLegacyLocalAuthData()
    expect(Object.keys(store).sort()).toEqual(['pm_theme_mode', 'tw_custom_user_profiles_v1'])
  })
})

describe('서버 호출 래퍼', () => {
  it('recordUserAccess: record_my_access RPC 호출, 실패해도 예외 없음', async () => {
    await recordUserAccess(true)
    expect(db.rpc).toHaveBeenCalledWith('record_my_access', { p_signed_in: true })
    db.rpc.mockRejectedValue(new Error('network'))
    await expect(recordUserAccess(false)).resolves.toBeUndefined()
  })

  it('deleteUserAccount: admin_delete_user RPC, 오류는 메시지로 반환', async () => {
    expect(await deleteUserAccount('uid-1')).toEqual({ success: true })
    expect(db.rpc).toHaveBeenCalledWith('admin_delete_user', { p_user_id: 'uid-1' })
    db.rpc.mockResolvedValue({ error: { message: 'admin only' } })
    expect(await deleteUserAccount('uid-2')).toEqual({ success: false, error: 'admin only' })
    expect((await deleteUserAccount('')).success).toBe(false)
  })

  it('ensureSupabaseAuth: 서버 세션이 있을 때만 true (별도 저장 토큰으로 되살리지 않는다)', async () => {
    expect(await ensureSupabaseAuth()).toBe(true)
    db.getSession.mockResolvedValue({ data: { session: null } })
    expect(await ensureSupabaseAuth()).toBe(false)
  })

  it('requestPasswordReset: 회사 메일만, 테스트 계정 분기 없음', async () => {
    expect((await requestPasswordReset('x@gmail.com')).success).toBe(false)
    expect((await requestPasswordReset('')).success).toBe(false)
    expect((await requestPasswordReset(' Test3@TWGROUP.co.kr ')).success).toBe(true)
    expect(db.resetPasswordForEmail).toHaveBeenCalledWith('test3@twgroup.co.kr', { redirectTo: 'https://x.test/' })
  })

  it('updateUserPassword: 6자 미만 거부, 서버 계정 비밀번호 변경', async () => {
    expect((await updateUserPassword('123')).success).toBe(false)
    expect((await updateUserPassword('123456')).success).toBe(true)
    expect(db.updateUser).toHaveBeenCalledWith({ password: '123456' })
  })
})

describe('formatLastAccessTime', () => {
  it('없는 값/잘못된 값', () => {
    expect(formatLastAccessTime(null).raw).toBeNull()
    expect(formatLastAccessTime('nope').raw).toBeNull()
  })

  it('최근 접속은 온라인', () => {
    const r = formatLastAccessTime(new Date(Date.now() - 60 * 1000).toISOString())
    expect(r.isOnline).toBe(true)
    expect(r.relative).toBe('1분 전')
  })

  it('오래된 접속은 오프라인', () => {
    expect(formatLastAccessTime(new Date(Date.now() - 3 * 86400000).toISOString()).isOnline).toBe(false)
  })
})
