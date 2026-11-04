/* CS 통합 관리 프로그램 저장소 어댑터.
 *
 * 원본 프로그램은 데이터를 브라우저 IndexedDB 에만 저장했다. 앱 안에 끼워 넣으면(부모 창에 __csBridge 가 있으면)
 * 같은 호출을 Supabase(cs_records 테이블, cs-files 버킷)로 보낸다. 부모가 없으면(단독 실행) 원본 그대로 IndexedDB 를 쓴다.
 *
 * - 원본 코드는 IndexedDB 를 db.transaction(store).objectStore(store).get/put/delete 로 쓴다. 같은 모양의 가짜 db(facade)를 돌려주어
 *   원본 코드를 거의 건드리지 않고 저장 위치만 바꾼다.
 * - 문서(main = CS 프로그램, material = 자재현황)를 "항목 1개 = 1행"으로 쪼개 저장하고, 저장할 때는 바뀐 항목만 보낸다.
 *   그래서 서로 다른 프로젝트를 동시에 고쳐도 덮어쓰지 않는다(같은 항목을 동시에 고치면 마지막 저장이 남는다).
 */
(function (root) {
  'use strict';

  var SHAPE = '__shape';
  var STORE_TO_DOC = { app_state: 'main', material_state: 'material' };

  function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isItemArray(v) { return Array.isArray(v) && v.every(function (x) { return isPlainObject(x) && x.id !== undefined && x.id !== null; }); }

  // 문서 객체 → 행 목록. 행 키 = container|id
  function flatten(data) {
    var rows = new Map();
    var keys = [];
    var types = {};
    function put(container, id, kind, sort, payload) { rows.set(container + '\u0001' + id, { container: container, id: id, kind: kind, sort: sort, data: payload }); }
    Object.keys(data || {}).forEach(function (k) {
      var v = data[k];
      keys.push(k);
      if (isItemArray(v)) {
        types[k] = 'array';
        var seen = new Set();
        v.forEach(function (item, i) {
          var id = String(item.id);
          while (seen.has(id)) id += '#' + i;
          seen.add(id);
          put(k, id, 'item', i, item);
        });
      } else if (isPlainObject(v) && k === 'projectDatasets') {
        types[k] = 'map';
        Object.keys(v).forEach(function (name, i) { put(k, name, 'entry', i, { v: v[name] }); });
      } else {
        types[k] = 'value';
        put(k, '_', 'value', 0, { v: v === undefined ? null : v });
      }
    });
    put(SHAPE, SHAPE, 'shape', 0, { keys: keys, types: types });
    return rows;
  }

  // 행 목록 → 문서 객체
  function assemble(rowList) {
    var shapeRow = rowList.find(function (r) { return r.container === SHAPE; });
    if (!shapeRow) return null;
    var shape = shapeRow.data;
    var out = {};
    shape.keys.forEach(function (k) {
      var mine = rowList.filter(function (r) { return r.container === k; }).sort(function (a, b) { return a.sort - b.sort; });
      var t = shape.types[k];
      if (t === 'array') out[k] = mine.map(function (r) { return r.data; });
      else if (t === 'map') { out[k] = {}; mine.forEach(function (r) { out[k][r.id] = r.data.v; }); }
      else out[k] = mine.length ? mine[0].data.v : null;
    });
    return out;
  }

  function signature(row) { return row.kind + '|' + row.sort + '|' + JSON.stringify(row.data); }
  function signatures(rows) { var m = new Map(); rows.forEach(function (r, k) { m.set(k, signature(r)); }); return m; }

  // 이전(base) 상태와 새 행들을 비교해 올릴 행과 지울 키를 구한다
  function diff(baseSigs, rows) {
    var upserts = [];
    var deletes = [];
    rows.forEach(function (r, k) { if (baseSigs.get(k) !== signature(r)) upserts.push(r); });
    baseSigs.forEach(function (_s, k) {
      if (!rows.has(k)) { var p = k.split('\u0001'); deletes.push({ container: p[0], id: p[1] }); }
    });
    return { upserts: upserts, deletes: deletes };
  }

  function bridge() {
    try { return (root.parent && root.parent !== root && root.parent.__csBridge) || null; } catch (e) { return null; }
  }
  function remote() { return !!bridge(); }

  var synced = {}; // doc → Map(키 → 서명): 서버와 맞춰진 마지막 상태
  var queue = Promise.resolve();

  async function fetchDoc(doc) {
    var list = await bridge().fetchRows(doc);
    var data = assemble(list);
    var rows = data ? flatten(data) : new Map();
    return { data: data, sigs: signatures(rows), list: list };
  }

  async function read(doc, opts) {
    var r = await fetchDoc(doc);
    if (!opts || opts.track !== false) synced[doc] = r.sigs;
    return { data: r.data, sigs: r.sigs };
  }

  async function write(doc, data, baseSigs) {
    var b = bridge();
    if (!b) throw new Error('저장소에 연결되어 있지 않습니다.');
    if (!b.canEdit) throw new Error('CS 데이터를 수정할 권한이 없습니다(조회만 가능합니다). 변경한 내용은 저장되지 않습니다.');
    var rows = flatten(data);
    var base = baseSigs || synced[doc] || new Map();
    var d = diff(base, rows);
    if (!d.upserts.length && !d.deletes.length) return;
    if (d.upserts.length) await b.upsertRows(doc, d.upserts);
    if (d.deletes.length) await b.deleteRows(doc, d.deletes);
    return signatures(rows);
  }

  // 문서 단위로 저장 순서를 지킨다
  function enqueueWrite(doc, data, baseSigs, track) {
    var job = queue.catch(function () {}).then(function () { return write(doc, data, baseSigs); }).then(function (sigs) {
      if (sigs && track) synced[doc] = sigs;
    });
    queue = job;
    return job;
  }

  // 다른 사람이 바꾼 내용이 있는지 확인한다(있으면 최신 문서를 돌려준다)
  async function pull(doc) {
    await queue.catch(function () {});
    var r = await fetchDoc(doc);
    var mine = synced[doc] || new Map();
    var changed = r.sigs.size !== mine.size;
    if (!changed) r.sigs.forEach(function (s, k) { if (mine.get(k) !== s) changed = true; });
    if (changed && r.data) synced[doc] = r.sigs;
    return { changed: changed && !!r.data, data: r.data };
  }

  // 원본 코드가 쓰는 IndexedDB 모양의 가짜 db
  function facade(opts) {
    var track = !(opts && opts.track === false);
    var own = null; // 추적하지 않는 사용자는 자기가 읽은 상태를 기준으로 비교한다
    return {
      close: function () {},
      transaction: function () {
        var tx = { oncomplete: null, onerror: null, onabort: null, error: null };
        var ops = [];
        var armed = false;
        function arm() {
          if (armed) return;
          armed = true;
          setTimeout(function () {
            Promise.all(ops).then(function () { if (tx.oncomplete) tx.oncomplete(); }, function (e) { tx.error = e; if (tx.onerror) tx.onerror(); if (tx.onabort) tx.onabort(); });
          }, 0);
        }
        function request(run) {
          var req = { result: undefined, error: null, onsuccess: null, onerror: null };
          var p = Promise.resolve().then(run).then(function (res) {
            req.result = res;
            if (req.onsuccess) req.onsuccess({ target: req });
          }, function (e) {
            req.error = e;
            if (req.onerror) req.onerror({ target: req });
            throw e;
          });
          ops.push(p);
          arm();
          return req;
        }
        tx.objectStore = function (name) {
          var doc = STORE_TO_DOC[name];
          return {
            get: function (key) {
              return request(async function () {
                if (name === 'files') {
                  var blob = await bridge().downloadFile(String(key));
                  return blob ? { id: key, blob: blob } : undefined;
                }
                var r = await read(doc, { track: track });
                if (!track) own = r.sigs;
                return r.data ? { id: key, data: r.data } : undefined;
              });
            },
            put: function (obj) {
              return request(async function () {
                if (name === 'files') return bridge().uploadFile(String(obj.id), obj.blob);
                await enqueueWrite(doc, obj.data, track ? undefined : own || undefined, track);
              });
            },
            delete: function (key) {
              return request(async function () {
                if (name === 'files') return bridge().deleteFile(String(key));
              });
            }
          };
        };
        return tx;
      }
    };
  }

  var api = {
    remote: remote,
    canEdit: function () { var b = bridge(); return !!(b && b.canEdit); },
    role: function () { var b = bridge(); return b ? b.role : null; },
    facade: facade,
    read: read,
    pull: pull,
    enqueueWrite: enqueueWrite,
    _flatten: flatten,
    _assemble: assemble,
    _diff: diff,
    _signatures: signatures
  };
  root.csStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
