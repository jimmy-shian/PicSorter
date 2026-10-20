const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

function pipeline(outcome, albumOptions = null) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE decisions (session_id TEXT, asset_id TEXT, action TEXT, target_album_id TEXT,
    target_album_title TEXT, applied INTEGER DEFAULT 0, failed INTEGER DEFAULT 0, last_error TEXT);
    INSERT INTO decisions (session_id, asset_id, action) VALUES ('session', 'photo', 'trash');`);
  if (albumOptions) {
    sqlite.exec("DELETE FROM decisions; INSERT INTO decisions (session_id, asset_id, action, target_album_id, target_album_title) VALUES ('session', 'one', 'album', 'virtual:trip', 'Trip'), ('session', 'two', 'album', 'virtual:trip', 'Trip');");
  }
  const db = {
    getFirstAsync: async (sql, ...args) => sqlite.prepare(sql).get(...args) ?? null,
    getAllAsync: async (sql, ...args) => sqlite.prepare(sql).all(...args),
    runAsync: async (sql, ...args) => sqlite.prepare(sql).run(...args),
  };
  const calls = { system: 0, permanent: 0, finished: 0, albums: [], replacements: [] };
  const mocks = {
    'expo-media-library': { Album: { getAll: async () => [] } },
    '@/lib/media': { applyAddToAlbum: async (albumId, ids) => {
      assert.ok(albumOptions, 'unexpected album operation');
      calls.albums.push({ albumId, ids });
      if (albumOptions.failBatch && ids.length > 1) throw new Error('Injected batch failure');
      return 'real-trip';
    } },
    '@/lib/gesture-album-storage': { replaceVirtualAlbumId: async (database, virtualId, realId) => {
      assert.strictEqual(database, db);
      calls.replacements.push([virtualId, realId]);
    } },
    '@/lib/trash': {
      moveAssetsToTrash: async (ids) => { calls.system++; assert.deepEqual(ids, ['photo']); return outcome; },
      permanentlyDeleteAssets: async () => { calls.permanent++; throw new Error('must not permanently delete'); },
    },
    '@/lib/db': { finishSession: async () => { calls.finished++; } },
  };
  const file = path.resolve(__dirname, '../src/lib/apply.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require, module, exports) {${code}\n})`, { filename: file })(
    (id) => { assert.ok(mocks[id], `unmocked module: ${id}`); return mocks[id]; }, module, module.exports,
  );
  return { run: (requestTrashConfirm) => module.exports.runApplyPipeline(db, 'session', { requestTrashConfirm }),
    calls, close: () => sqlite.close(), row: () => sqlite.prepare('SELECT * FROM decisions').get() };
}

test('略過 App 詢問仍經過系統垃圾桶，成功後才標記完成', async (t) => {
  const p = pipeline({ kind: 'trashed', count: 1 }); t.after(p.close);
  const result = await p.run(async () => 'trash');
  assert.equal(p.calls.system, 1);
  assert.equal(p.calls.permanent, 0);
  assert.equal(result.appliedTrash, 1);
  assert.equal(p.row().applied, 1);
  assert.equal(p.calls.finished, 1);
});

test('系統取消授權時保留待處理，不能改走永久刪除', async (t) => {
  const p = pipeline({ kind: 'cancelled' }); t.after(p.close);
  const result = await p.run(async () => 'trash');
  assert.equal(p.calls.system, 1);
  assert.equal(p.calls.permanent, 0);
  assert.equal(result.appliedTrash, 0);
  assert.equal(result.pendingCount, 1);
  assert.equal(p.row().applied, 0);
  assert.equal(p.row().failed, 0);
  assert.equal(p.calls.finished, 0);
});

test('取消 App 確認時不呼叫系統也不結案', async (t) => {
  const p = pipeline({ kind: 'trashed', count: 1 }); t.after(p.close);
  const result = await p.run(async () => 'skip');
  assert.equal(p.calls.system, 0);
  assert.equal(p.calls.permanent, 0);
  assert.equal(result.pendingCount, 1);
  assert.equal(p.calls.finished, 0);
});

for (const failBatch of [false, true]) {
  test(`虛擬相簿${failBatch ? '批次失敗後逐張重試' : '批次成功'}共用 ID 與偏好更新流程`, async (t) => {
    const p = pipeline(null, { failBatch }); t.after(p.close);
    const result = await p.run();
    assert.equal(result.appliedAlbum, 2);
    assert.equal(result.pendingCount, 0);
    assert.deepEqual(p.calls.replacements, [['virtual:trip', 'real-trip']]);
    if (failBatch) {
      assert.deepEqual(p.calls.albums.map((call) => call.albumId), ['virtual:trip', 'virtual:trip', 'real-trip']);
    }
  });
}
