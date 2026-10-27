import { describe, it, expect, vi, beforeEach } from "vitest";

// supabase 클라이언트를 가짜로 바꿔, 서비스가 쓰는 호출 모양(insert/update/delete + select)과 오류 해석을 점검한다.
const calls = [];
let nextResult = { data: [], error: null };

function builder(table) {
  const b = {
    table,
    ops: [],
    insert(row) { b.ops.push(["insert", row]); return b; },
    update(row) { b.ops.push(["update", row]); return b; },
    delete() { b.ops.push(["delete"]); return b; },
    upsert(row, opts) { b.ops.push(["upsert", row, opts]); return b; },
    select() { b.ops.push(["select"]); return b; },
    eq(c, v) { b.ops.push(["eq", c, v]); return b; },
    order() { return b; },
    range() { return b; },
    then(res, rej) { calls.push(b); return Promise.resolve(nextResult).then(res, rej); },
  };
  return b;
}

vi.mock("../src/supabase.js", () => ({ supabase: { from: (t) => builder(t) } }));

const svc = await import("../src/tripService.js");

beforeEach(() => {
  calls.length = 0;
  nextResult = { data: [], error: null };
});

describe("tripErrorMessage", () => {
  it("DB 오류를 알아볼 수 있는 한국어로 바꾼다", () => {
    expect(svc.tripErrorMessage({ code: "42501", message: "new row violates row-level security policy" })).toContain("권한");
    expect(svc.tripErrorMessage({ code: "23505", message: "dup" })).toContain("이미");
    expect(svc.tripErrorMessage({ code: "23503", message: "fk" })).toContain("비활성");
    expect(svc.tripErrorMessage({ code: "23514", message: "check" })).toContain("입력값");
    expect(svc.tripErrorMessage({ code: "P0001", message: "trip_member_dept_mismatch" })).toContain("부서");
    expect(svc.tripErrorMessage({ code: "P0001", message: "trip_member_inactive" })).toContain("비활성");
    expect(svc.tripErrorMessage({ code: "P0001", message: "trip_member_has_assignments" })).toContain("배정");
  });
  it("테이블이 아직 없으면(마이그레이션 전) 준비 안 됨 안내를 준다", () => {
    expect(svc.tripErrorMessage({ code: "PGRST205", message: "Could not find the table 'public.trip_members'" })).toContain("준비되지 않았습니다");
    expect(svc.tripErrorMessage({ code: "42P01", message: 'relation "trip_members" does not exist' })).toContain("준비되지 않았습니다");
  });
  it("알 수 없는 오류는 원문을 그대로 보여 준다", () => {
    expect(svc.tripErrorMessage({ message: "something odd" })).toBe("something odd");
    expect(svc.tripErrorMessage(null)).toBe("");
  });
});

describe("쓰기 결과 확인", () => {
  it("수정·삭제가 0건이면(권한이 막은 경우) 성공으로 보지 않고 오류를 돌려준다", async () => {
    nextResult = { data: [], error: null };
    const r1 = await svc.updateAssignment("x", { project_id: "p", dept: "vision", member_id: "m", start_date: "2026-11-02", end_date: "2026-11-03" });
    expect(r1.error).toContain("저장되지 않았습니다");
    const r2 = await svc.deleteAssignment("x");
    expect(r2.error).toContain("저장되지 않았습니다");
  });
  it("정상 응답이면 첫 행을 돌려준다", async () => {
    nextResult = { data: [{ id: "n1", name: "가" }], error: null };
    const r = await svc.createMember({ name: " 가 ", dept: "vision", team: "", rank: "", grade: "", b1_visa: 1 });
    expect(r).toEqual({ data: { id: "n1", name: "가" }, error: "" });
    const insert = calls[0].ops.find((o) => o[0] === "insert")[1];
    expect(insert).toMatchObject({ name: "가", team: null, rank: null, grade: null, b1_visa: true, active: true });
  });
  it("멤버가 있으면 배정의 자리 이름은 버리고, 없으면 자리 이름을 남긴다", async () => {
    nextResult = { data: [{ id: "a" }], error: null };
    await svc.createAssignment({ project_id: "p", dept: "vision", member_id: "m1", label: "외주1", start_date: "2026-11-02", end_date: "2026-11-09" });
    await svc.createAssignment({ project_id: "p", dept: "vision", member_id: "", label: " 외주1 ", start_date: "2026-11-02", end_date: "2026-11-09" });
    expect(calls[0].ops.find((o) => o[0] === "insert")[1]).toMatchObject({ member_id: "m1", label: null });
    expect(calls[1].ops.find((o) => o[0] === "insert")[1]).toMatchObject({ member_id: null, label: "외주1" });
  });
  it("특이사항을 비우면 삭제하고, 채우면 (PJT, 부서) 기준으로 덮어쓴다", async () => {
    nextResult = { data: [{ project_id: "p" }], error: null };
    expect((await svc.saveDeptNote({ project_id: "p", dept: "vision", note: " 메모 " })).error).toBe("");
    expect(calls[0].ops.find((o) => o[0] === "upsert")[2]).toEqual({ onConflict: "project_id,dept" });
    expect(calls[0].ops.find((o) => o[0] === "upsert")[1].note).toBe("메모");
    nextResult = { data: [], error: null };
    expect((await svc.saveDeptNote({ project_id: "p", dept: "vision", note: "  " })).error).toBe("");
    expect(calls[1].ops.some((o) => o[0] === "delete")).toBe(true);
  });
});

describe("fetchTripData", () => {
  it("한 표라도 실패하면 데이터 없이 오류 문구만 돌려준다", async () => {
    nextResult = { data: null, error: { code: "PGRST205", message: "Could not find the table" } };
    const r = await svc.fetchTripData();
    expect(r.data).toBeNull();
    expect(r.error).toContain("준비되지 않았습니다");
  });
  it("모든 표를 읽어 한 묶음으로 돌려준다", async () => {
    nextResult = { data: [], error: null };
    const r = await svc.fetchTripData();
    expect(r.error).toBe("");
    expect(Object.keys(r.data).sort()).toEqual(["absences", "assignments", "members", "notes"]);
  });
});
