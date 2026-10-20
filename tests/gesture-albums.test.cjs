const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

// 用專案 TypeScript compiler 載入純資料邏輯，無須載入 React Native runtime。
const cache = new Map();
function load(relative) {
  const file = path.resolve(__dirname, '../src/lib', `${relative}.ts`);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInThisContext(`(function(require, module, exports) {${code}\n})`, { filename: file })(
    (name) => name.startsWith('./') ? load(name.slice(2)) : require(name), module, module.exports,
  );
  return module.exports;
}
const { normalizeGestureDraft, toggleShortcut, parseShortcutIds, reorderAlbumGroup, albumDisplayGroups } = load('gesture-albums');
const { loadGestureAlbumSettings, saveGestureAlbumSettings } = load('gesture-album-storage');
const entry = (id, sortIndex = 0, extra = {}) => ({ id, title: id, sortIndex, pinned: false, hidden: false, ...extra });
const entries = ['a', 'b', 'c', 'd', 'e'].map((id, index) => entry(id, index));
const draft = (patch = {}) => ({ entries, upId: 'a', shortcutIds: ['b', 'c'], downId: 'c', ...patch });

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE prefs (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE album_order (album_id TEXT PRIMARY KEY, title TEXT NOT NULL, sort_index INTEGER NOT NULL, pinned INTEGER NOT NULL, hidden INTEGER NOT NULL);');
  const adapter = {
    failKey: null,
    getFirstAsync: async (sql, ...values) => sqlite.prepare(sql).get(...values) ?? null,
    runAsync: async (sql, ...values) => {
      if (values[0] === adapter.failKey) throw new Error('Injected disk write failure');
      return sqlite.prepare(sql).run(...values);
    },
    withExclusiveTransactionAsync: async (callback) => {
      sqlite.exec('BEGIN');
      try { await callback(adapter); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    close: () => sqlite.close(),
    all: (sql) => sqlite.prepare(sql).all(),
  };
  return adapter;
}

test('上滑單選可與下滑快捷重疊，互不覆蓋', () => {
  const next = normalizeGestureDraft(draft({ upId: 'c' }));
  assert.equal(next.upId, 'c');
  assert.deepEqual(next.shortcutIds, ['b', 'c']);
  assert.equal(next.downId, 'c');
});

test('第五個快捷不加入，也不更換目前目標', () => {
  const original = draft({ shortcutIds: ['a', 'b', 'c', 'd'] });
  assert.strictEqual(toggleShortcut(original, 'e'), original);
});

test('移除快捷後補號，再加入時排最後', () => {
  const removed = toggleShortcut(draft(), 'b');
  assert.deepEqual(removed.shortcutIds, ['c']);
  assert.deepEqual(toggleShortcut(removed, 'a').shortcutIds, ['c', 'a']);
});

test('移除或清空快捷不影響獨立的下滑目標', () => {
  const removed = toggleShortcut(draft(), 'c');
  assert.equal(removed.downId, 'c');
  const empty = toggleShortcut(removed, 'b');
  assert.equal(empty.downId, 'c');
  assert.deepEqual(empty.shortcutIds, []);
});

test('隱藏目前目標立即清理關聯，恢復顯示不自動恢復目標', () => {
  const hidden = normalizeGestureDraft(draft({ upId: 'c', entries: entries.map((e) => e.id === 'c' ? { ...e, hidden: true } : e) }));
  assert.equal(hidden.upId, null);
  assert.equal(hidden.downId, 'b');
  assert.deepEqual(hidden.shortcutIds, ['b']);
  const restored = normalizeGestureDraft({ ...hidden, entries });
  assert.equal(restored.upId, null);
  assert.deepEqual(restored.shortcutIds, ['b']);
});

test('不同 ID 的同名相簿可同時選取，失效 ID 與重複 ID 被清除', () => {
  const next = normalizeGestureDraft(draft({ entries: [entry('a', 0, { title: 'Ringtones' }), entry('b', 1, { title: 'Ringtones' })], shortcutIds: ['a', 'b', 'a', 'missing'], downId: 'missing' }));
  assert.deepEqual(next.shortcutIds, ['a', 'b']);
  assert.equal(next.downId, 'a');
});

test('一般排序只交換群組中的位置，保留快捷、目標及固定狀態', () => {
  const original = draft({ entries: [entry('a', 1), entry('b', 5), entry('p', 3, { pinned: true })] });
  const next = { ...original, entries: reorderAlbumGroup(original.entries, ['b', 'a']) };
  assert.equal(next.entries.find((e) => e.id === 'b').sortIndex, 1);
  assert.equal(next.entries.find((e) => e.id === 'a').sortIndex, 5);
  assert.equal(next.entries.find((e) => e.id === 'p').sortIndex, 3);
  assert.deepEqual(next.shortcutIds, original.shortcutIds);
  assert.equal(next.upId, original.upId);
  assert.equal(next.downId, original.downId);
  assert.equal(original.entries[0].sortIndex, 1);
});

test('快捷偏好解析處理毀損資料與重複 ID', () => {
  assert.deepEqual(parseShortcutIds('{bad'), []);
  assert.deepEqual(parseShortcutIds('{}'), []);
  assert.deepEqual(parseShortcutIds('["a","a",3,null,"b"]'), ['a', 'b']);
});

test('舊版首次初始化第 2～5 個，後續一般排序不重排快捷', async (t) => {
  const db = database(); t.after(db.close);
  const initial = await loadGestureAlbumSettings(db, entries);
  assert.deepEqual(initial.shortcutIds, ['b', 'c', 'd', 'e']);
  const reordered = await loadGestureAlbumSettings(db, [...entries].reverse());
  assert.deepEqual(reordered.shortcutIds, initial.shortcutIds);
});

test('清空快捷、上滑目標後重新載入仍為空', async (t) => {
  const db = database(); t.after(db.close);
  await saveGestureAlbumSettings(db, draft({ upId: null, shortcutIds: [], downId: null }));
  const reloaded = await loadGestureAlbumSettings(db, entries);
  assert.deepEqual(reloaded, { upId: null, shortcutIds: [], downId: null });
});

test('設定與相簿狀態一併儲存，同名相簿不合併', async (t) => {
  const db = database(); t.after(db.close);
  const original = draft({ entries: [entry('a', 1, { title: 'Ringtones', pinned: true }), entry('b', 2, { title: 'Ringtones' }), entry('c', 3, { hidden: true })], shortcutIds: ['b'], downId: 'b' });
  await saveGestureAlbumSettings(db, original);
  const reloaded = await loadGestureAlbumSettings(db, original.entries.filter((e) => !e.hidden));
  assert.deepEqual(reloaded, { upId: 'a', shortcutIds: ['b'], downId: 'b' });
  assert.equal(db.all('SELECT * FROM album_order').length, 3);
  assert.equal(db.all("SELECT pinned FROM album_order WHERE album_id = 'a'")[0].pinned, 1);
});

test('儲存中途失敗時 transaction 還原排序與全部偏好', async (t) => {
  const db = database(); t.after(db.close);
  await saveGestureAlbumSettings(db, draft());
  const before = db.all('SELECT * FROM prefs ORDER BY key');
  db.failKey = 'down_shortcut_ids';
  await assert.rejects(saveGestureAlbumSettings(db, draft({ upId: 'e', entries: entries.map((e) => ({ ...e, pinned: true })) })), /disk write failure/);
  assert.deepEqual(db.all('SELECT * FROM prefs ORDER BY key'), before);
  assert.ok(db.all('SELECT * FROM album_order').every((e) => e.pinned === 0));
  db.failKey = null;
  await saveGestureAlbumSettings(db, draft({ upId: 'e' }));
  assert.equal((await loadGestureAlbumSettings(db, entries)).upId, 'e');
});


test('下滑目標可獨立於四個快捷保存並重新載入', async (t) => {
  const db = database(); t.after(db.close);
  await saveGestureAlbumSettings(db, draft({ shortcutIds: ['a', 'b', 'c', 'd'], downId: 'e' }));
  const reloaded = await loadGestureAlbumSettings(db, entries);
  assert.equal(reloaded.downId, 'e');
  assert.deepEqual(reloaded.shortcutIds, ['a', 'b', 'c', 'd']);
});
const { edgeScroll, reorderIndex, hitAlbum } = load('drag-geometry');
test('邊緣捲動 48dp 啟動、64dp 才停止，上下邊界對稱', () => {
  assert.equal(edgeScroll(49, 0, 600, 0).direction, 0);
  assert.equal(edgeScroll(47, 0, 600, 0).direction, -1);
  assert.equal(edgeScroll(63, 0, 600, -1).direction, -1);
  assert.equal(edgeScroll(65, 0, 600, -1).direction, 0);
  assert.equal(edgeScroll(553, 0, 600, 0).direction, 1);
  assert.equal(edgeScroll(537, 0, 600, 1).direction, 1);
  assert.equal(edgeScroll(535, 0, 600, 1).direction, 0);
  assert.ok(Math.abs(edgeScroll(8, 0, 600, 0).velocity) > Math.abs(edgeScroll(24, 0, 600, 0).velocity));
  assert.ok(Math.abs(edgeScroll(24, 0, 600, 0).velocity) > Math.abs(edgeScroll(47, 0, 600, 0).velocity));
});
test('換位跨過中心且保留緩衝，不因 1～2dp 反覆交換', () => {
  assert.equal(reorderIndex(37, 68, 0, 6), 0);
  assert.equal(reorderIndex(39, 68, 0, 6), 1);
  assert.equal(reorderIndex(33, 68, 1, 6), 1);
  assert.equal(reorderIndex(29, 68, 1, 6), 0);
  assert.equal(reorderIndex(1000, 68, 1, 6), 5);
  assert.equal(reorderIndex(-100, 68, 1, 6), 0);
});
test('拖曳可命中第 4 或任意相簿，離開目標不分類', () => {
  const rects = new Map(Array.from({ length: 8 }, (_, i) => [`album-${i}`, { x: i * 100, y: 600, width: 92, height: 60 }]));
  assert.equal(hitAlbum(rects, 340, 630), 'album-3');
  assert.equal(hitAlbum(rects, 740, 630), 'album-7');
  assert.equal(hitAlbum(rects, 340, 590), null);
  assert.equal(hitAlbum(rects, 295, 630), null);
});


test('隱藏的固定與一般相簿集中置底，恢復後回原群組與位置', () => {
  const original = [entry('p', 0, { pinned: true }), entry('a', 1), entry('b', 2), entry('c', 3)];
  const hidden = original.map((e) => ['p', 'b'].includes(e.id) ? { ...e, hidden: true } : e);
  const groups = albumDisplayGroups(hidden);
  assert.deepEqual(groups.pinned, []);
  assert.deepEqual(groups.normal.map((e) => e.id), ['a', 'c']);
  assert.deepEqual(groups.hidden.map((e) => e.id), ['p', 'b']);
  const restored = hidden.map((e) => ({ ...e, hidden: false }));
  assert.deepEqual(albumDisplayGroups(restored), albumDisplayGroups(original));
});

test('搜尋不分大小寫且忽略前後空白，排序只交換命中項目並保留隱藏原位', () => {
  const original = [entry('a', 0, { title: 'Trip A' }), entry('h', 1, { title: 'Trip hidden', hidden: true }), entry('x', 2), entry('b', 3, { title: 'TRIP B' })];
  const groups = albumDisplayGroups(original, '  trip  ');
  assert.deepEqual(groups.normal.map((e) => e.id), ['a', 'b']);
  assert.deepEqual(groups.hidden.map((e) => e.id), ['h']);
  const next = reorderAlbumGroup(original, ['b', 'a']);
  assert.equal(next.find((e) => e.id === 'h').sortIndex, 1);
  assert.equal(next.find((e) => e.id === 'x').sortIndex, 2);
  assert.deepEqual(albumDisplayGroups(next.map((e) => ({ ...e, hidden: false }))).normal.map((e) => e.id), ['b', 'h', 'x', 'a']);
  assert.deepEqual(albumDisplayGroups(original, 'missing'), { pinned: [], normal: [], hidden: [] });
});
