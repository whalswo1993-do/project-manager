import { supabase } from "./supabase.js";

// 출장자 관리 DB 접근. 화면은 이 파일의 함수만 부른다.
// 모든 함수는 { data, error } 형태로 돌려주고, error 는 사람이 읽을 수 있는 글(string)이다.

const TABLES = {
  members: "trip_members",
  assignments: "trip_assignments",
  absences: "trip_absences",
  notes: "trip_project_notes",
};

/** DB 오류를 사용자에게 보여 줄 한국어 문장으로 바꾼다 */
export function tripErrorMessage(error) {
  if (!error) return "";
  const code = error.code || "";
  const msg = String(error.message || error || "");
  if (msg === "trip_no_rows") return "저장되지 않았습니다. 권한이 없거나 이미 삭제된 항목입니다. 새로고침 후 다시 시도하세요.";
  if (msg.includes("trip_member_dept_mismatch")) return "그 인원의 부서와 배정하려는 부서가 다릅니다.";
  if (msg.includes("trip_member_inactive")) return "비활성 처리된 인원은 새로 배정할 수 없습니다.";
  if (msg.includes("trip_member_has_assignments")) return "배정이 있는 인원은 부서를 바꿀 수 없습니다. 먼저 배정을 정리하세요.";
  if (code === "PGRST205" || code === "42P01" || /Could not find the table|does not exist/i.test(msg)) {
    return "출장자 관리용 DB가 아직 준비되지 않았습니다. 관리자에게 문의하세요.";
  }
  if (code === "42501" || /row-level security|permission denied/i.test(msg)) return "이 작업을 할 권한이 없습니다. (PM 이상 또는 팀장 계정만 수정할 수 있습니다)";
  if (code === "23505") return "같은 부서·팀에 같은 이름의 인원이 이미 있습니다.";
  if (code === "23503") return "연결된 배정이 있어 삭제할 수 없습니다. 먼저 배정을 지우거나 인원을 '비활성'으로 바꾸세요.";
  if (code === "23514" || code === "22007" || code === "22008") return "입력값을 확인하세요. (날짜 순서, 인원 수 범위 등)";
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "서버에 연결하지 못했습니다. 인터넷 연결을 확인하세요.";
  return msg || "알 수 없는 오류가 발생했습니다.";
}

async function selectAll(table, orderBy) {
  // Supabase 는 한 번에 최대 1000행이라 나눠서 모두 가져온다
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select("*");
    orderBy.forEach((o) => { q = q.order(o); });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) return { error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return { data: rows };
}

/** 화면에 필요한 모든 표를 한 번에 읽는다 */
export async function fetchTripData() {
  try {
    const results = await Promise.all([
      selectAll(TABLES.members, ["dept", "team", "name"]),
      selectAll(TABLES.assignments, ["start_date"]),
      selectAll(TABLES.absences, ["start_date"]),
      selectAll(TABLES.notes, ["dept"]),
    ]);
    const failed = results.find((r) => r.error);
    if (failed) return { data: null, error: tripErrorMessage(failed.error) };
    const [members, assignments, absences, notes] = results.map((r) => r.data);
    return { data: { members, assignments, absences, notes }, error: "" };
  } catch (e) {
    return { data: null, error: tripErrorMessage(e) };
  }
}

// 쓰기 공통: 권한(RLS)이 막은 수정·삭제는 오류 없이 0건으로 끝나므로 영향 행을 확인한다.
async function write(table, op, { id, row, requireRow = true } = {}) {
  try {
    let q = supabase.from(table);
    if (op === "insert") q = q.insert(row).select();
    else if (op === "update") q = q.update(row).eq("id", id).select();
    else if (op === "delete") q = q.delete().eq("id", id).select();
    const { data, error } = await q;
    if (error) return { data: null, error: tripErrorMessage(error) };
    if (requireRow && (!data || data.length === 0)) return { data: null, error: tripErrorMessage({ message: "trip_no_rows" }) };
    return { data: op === "delete" ? null : data[0], error: "" };
  } catch (e) {
    return { data: null, error: tripErrorMessage(e) };
  }
}

const clean = (v) => (typeof v === "string" ? v.trim() : v);
const blankToNull = (v) => {
  const c = clean(v);
  return c === "" || c === undefined ? null : c;
};

// ── 인원 ──
const memberRow = (m) => ({
  name: clean(m.name),
  rank: blankToNull(m.rank),
  dept: m.dept,
  team: blankToNull(m.team),
  grade: blankToNull(m.grade),
  b1_visa: Boolean(m.b1_visa),
  active: m.active !== false,
  note: blankToNull(m.note),
});
export const createMember = (m) => write(TABLES.members, "insert", { row: memberRow(m) });
export const updateMember = (id, m) => write(TABLES.members, "update", { id, row: memberRow(m) });
export const deleteMember = (id) => write(TABLES.members, "delete", { id });

/** 붙여넣기로 여러 명을 한 번에 넣는다. 한 명이라도 실패하면 전체가 취소된다(한 번의 요청). */
export async function insertMembers(list) {
  if (!list.length) return { data: [], error: "" };
  try {
    const { data, error } = await supabase.from(TABLES.members).insert(list.map(memberRow)).select();
    if (error) return { data: null, error: tripErrorMessage(error) };
    return { data: data || [], error: "" };
  } catch (e) {
    return { data: null, error: tripErrorMessage(e) };
  }
}

/** 부서별 특이사항 저장 (프로젝트 × 부서 당 한 줄, 비우면 삭제) */
export async function saveDeptNote({ project_id, dept, note }) {
  try {
    const text = clean(note) || "";
    const q = text
      ? supabase.from(TABLES.notes).upsert({ project_id, dept, note: text, updated_at: new Date().toISOString() }, { onConflict: "project_id,dept" }).select()
      : supabase.from(TABLES.notes).delete().eq("project_id", project_id).eq("dept", dept).select();
    const { data, error } = await q;
    if (error) return { error: tripErrorMessage(error) };
    if (text && (!data || data.length === 0)) return { error: tripErrorMessage({ message: "trip_no_rows" }) };
    return { error: "" };
  } catch (e) {
    return { error: tripErrorMessage(e) };
  }
}

// ── 출장자 배정 ──
const assignmentRow = (a) => ({
  project_id: a.project_id,
  dept: a.dept,
  member_id: a.member_id || null,
  label: a.member_id ? null : blankToNull(a.label),
  start_date: a.start_date,
  end_date: a.end_date,
  note: blankToNull(a.note),
});
export const createAssignment = (a) => write(TABLES.assignments, "insert", { row: assignmentRow(a) });
export const updateAssignment = (id, a) => write(TABLES.assignments, "update", { id, row: assignmentRow(a) });
export const deleteAssignment = (id) => write(TABLES.assignments, "delete", { id });

// ── 부재 ──
const absenceRow = (a) => ({
  member_id: a.member_id,
  kind: a.kind || "other",
  location: blankToNull(a.location),
  start_date: a.start_date,
  end_date: blankToNull(a.end_date),
  note: blankToNull(a.note),
});
export const createAbsence = (a) => write(TABLES.absences, "insert", { row: absenceRow(a) });
export const updateAbsence = (id, a) => write(TABLES.absences, "update", { id, row: absenceRow(a) });
export const deleteAbsence = (id) => write(TABLES.absences, "delete", { id });
