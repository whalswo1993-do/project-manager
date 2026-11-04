import { supabase } from "./supabase";

// CS 통합 관리 프로그램(public/cs, iframe)이 Supabase 에 저장·조회할 때 쓰는 다리.
// 프로그램은 같은 출처(same-origin)라서 부모 창의 window.__csBridge 를 직접 부른다(public/cs/cs-store.js 참고).
// 로그인 세션과 JWT 재시도는 앱의 supabase 클라이언트가 맡으므로 프로그램에는 토큰을 넘기지 않는다.
export const CS_EDIT_ROLES = ["admin", "grade3", "grade2_5", "grade2"];
const BUCKET = "cs-files";
const PAGE = 1000;
const BATCH_BYTES = 1_500_000; // 한 번에 올리는 요청 크기 상한(대략)
const BATCH_ROWS = 200;

function fail(error, what) {
  const msg = error?.message || String(error);
  throw new Error(`${what}: ${msg}`);
}

export function createCsBridge(role) {
  return {
    role,
    canEdit: CS_EDIT_ROLES.includes(role),

    // doc 의 모든 행을 가져온다(1000행씩 이어서)
    async fetchRows(doc) {
      const out = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("cs_records")
          .select("container,id,kind,sort,data")
          .eq("doc", doc)
          .order("container", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) fail(error, "CS 데이터를 불러오지 못했습니다");
        out.push(...data);
        if (data.length < PAGE) break;
      }
      return out;
    },

    async upsertRows(doc, rows) {
      let batch = [];
      let bytes = 0;
      const flush = async () => {
        if (!batch.length) return;
        const { error } = await supabase.from("cs_records").upsert(batch, { onConflict: "doc,container,id" });
        if (error) fail(error, "CS 데이터를 저장하지 못했습니다");
        batch = [];
        bytes = 0;
      };
      for (const r of rows) {
        const row = { doc, container: r.container, id: r.id, kind: r.kind, sort: r.sort, data: r.data };
        const size = JSON.stringify(row.data).length;
        if (batch.length && (batch.length >= BATCH_ROWS || bytes + size > BATCH_BYTES)) await flush();
        batch.push(row);
        bytes += size;
      }
      await flush();
    },

    async deleteRows(doc, keys) {
      const byContainer = new Map();
      keys.forEach((k) => {
        if (!byContainer.has(k.container)) byContainer.set(k.container, []);
        byContainer.get(k.container).push(k.id);
      });
      for (const [container, ids] of byContainer) {
        for (let i = 0; i < ids.length; i += 100) {
          const { error } = await supabase
            .from("cs_records")
            .delete()
            .eq("doc", doc)
            .eq("container", container)
            .in("id", ids.slice(i, i + 100));
          if (error) fail(error, "CS 데이터를 삭제하지 못했습니다");
        }
      }
    },

    async uploadFile(id, blob) {
      const { error } = await supabase.storage.from(BUCKET).upload(id, blob, {
        upsert: true,
        contentType: blob?.type || "application/octet-stream",
      });
      if (error) fail(error, "첨부파일을 올리지 못했습니다");
    },

    async downloadFile(id) {
      const { data, error } = await supabase.storage.from(BUCKET).download(id);
      if (error) {
        if (/not.?found|404|does not exist/i.test(error.message || "") || error.statusCode === "404") return null;
        fail(error, "첨부파일을 내려받지 못했습니다");
      }
      return data;
    },

    async deleteFile(id) {
      const { error } = await supabase.storage.from(BUCKET).remove([id]);
      if (error) fail(error, "첨부파일을 지우지 못했습니다");
    },
  };
}
