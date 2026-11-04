import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// public/cs/cs-store.js 는 브라우저용 일반 스크립트라서 소스를 읽어 module 객체를 넘겨 실행한다
const mod = { exports: {} };
new Function('module', readFileSync('public/cs/cs-store.js', 'utf8'))(mod);
const store = mod.exports;

const sample = () => ({
  projects: [{ id: 'P-1', name: 'a', notes: 'x' }, { id: 'P-2', name: 'b' }],
  tasks: [],
  projectDatasets: { '2309AD': [{ item: 1 }], '2308DS': [] },
  pjtMasterOrder: ['2309AD', '2308DS'],
  closedPjts: [],
});

const roundTrip = (data) => {
  const rows = [...store._flatten(data).values()];
  return store._assemble(rows.map((r) => ({ ...r })));
};

describe('CS 저장소 어댑터(항목 단위 저장)', () => {
  it('문서를 행으로 쪼갰다가 같은 모양으로 되돌린다(빈 목록·맵·값 포함)', () => {
    expect(roundTrip(sample())).toEqual(sample());
  });

  it('목록 항목의 순서를 보존한다', () => {
    const d = { projects: [{ id: 'B' }, { id: 'A' }, { id: 'C' }] };
    expect(roundTrip(d).projects.map((p) => p.id)).toEqual(['B', 'A', 'C']);
  });

  it('id 가 겹쳐도 항목이 사라지지 않는다', () => {
    const d = { projects: [{ id: 'X', n: 1 }, { id: 'X', n: 2 }] };
    expect(roundTrip(d).projects).toEqual(d.projects);
  });

  it('id 가 없는 항목이 섞인 목록은 통째로 하나의 값으로 저장한다', () => {
    const d = { list: [{ id: 1 }, { name: 'no id' }], nothing: null };
    expect(roundTrip(d)).toEqual(d);
  });

  it('바뀐 항목만 올리고 사라진 항목만 지운다', () => {
    const before = store._signatures(store._flatten(sample()));
    const next = sample();
    next.projects[0].name = 'changed';
    next.projects.splice(1, 1);
    const d = store._diff(before, store._flatten(next));
    expect(d.upserts.map((r) => r.id)).toEqual(['P-1']);
    expect(d.deletes).toEqual([{ container: 'projects', id: 'P-2' }]);
  });

  it('바뀐 것이 없으면 아무것도 보내지 않는다', () => {
    const before = store._signatures(store._flatten(sample()));
    const d = store._diff(before, store._flatten(sample()));
    expect(d.upserts).toEqual([]);
    expect(d.deletes).toEqual([]);
  });

  it('서버에 문서가 없으면 null 을 돌려준다', () => {
    expect(store._assemble([])).toBeNull();
  });
});
