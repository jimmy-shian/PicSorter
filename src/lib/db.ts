import * as SQLite from 'expo-sqlite';

export const DATABASE_NAME = 'picsorter.db';
export const DATABASE_VERSION = 3;

export async function migrateDbIfNeeded(db: SQLite.SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= DATABASE_VERSION) return;

  // 啟動必經之路：任何遷移失敗都不能讓 App 白屏卡死。
  // ALTER TABLE 在欄位已存在時會拋錯（例如舊版本升級中途被殺掉），
  // 所以先查 PRAGMA table_info 再補欄位，做到冪等；最後一律寫 user_version。
  try {
    if (version === 0) {
      await db.execAsync(`
      PRAGMA journal_mode = 'wal';
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY NOT NULL,
        source_album_id TEXT,
        source_album_title TEXT NOT NULL,
        sort_order TEXT NOT NULL DEFAULT 'newest',
        status TEXT NOT NULL DEFAULT 'open',
        created_at INTEGER NOT NULL,
        finished_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_album_id TEXT,
        target_album_title TEXT,
        created_at INTEGER NOT NULL,
        applied INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        uri TEXT,
        width INTEGER,
        height INTEGER,
        last_error TEXT,
        UNIQUE(session_id, asset_id)
      );
      CREATE INDEX IF NOT EXISTS idx_decisions_session ON decisions(session_id);
      CREATE TABLE IF NOT EXISTS album_order (
        album_id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        sort_index INTEGER NOT NULL,
        hidden INTEGER NOT NULL DEFAULT 0,
        pinned INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS prefs (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
    } else {
      // v0 建表已包含全部新欄位；只有老庫才需要逐版補欄
      // v1 → v2：檢查網格需要縮圖，決定列加存顯示用 uri/尺寸（P5）
      if (version <= 1) {
        await addColumnIfMissing(db, 'decisions', 'uri', 'TEXT');
        await addColumnIfMissing(db, 'decisions', 'width', 'INTEGER');
        await addColumnIfMissing(db, 'decisions', 'height', 'INTEGER');
      }
      // v2 → v3：套用結果頁需要顯示失敗原因（P6）
      if (version <= 2) {
        await addColumnIfMissing(db, 'decisions', 'last_error', 'TEXT');
      }
    }
  } finally {
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  }
}

/** 冪等加欄：欄位已存在則跳過，避免升級中斷後重跑拋錯導致啟動白屏 */
async function addColumnIfMissing(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  type: string,
): Promise<void> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (rows.some((r) => r.name === column)) return;
  await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
}

export function newSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** P3 進度恢復：整理工作查詢與管理 */

export interface OpenSessionInfo {
  id: string;
  source_album_id: string | null;
  source_album_title: string;
  sort_order: string;
  created_at: number;
  decision_count: number;
  trash_count: number;
}

export interface DecisionRow {
  asset_id: string;
  action: string;
  target_album_id: string | null;
  target_album_title: string | null;
  uri: string | null;
  width: number | null;
  height: number | null;
  applied: number;
  failed: number;
  last_error: string | null;
  created_at: number;
}

const OPEN_SESSION_COLUMNS = `
  s.id, s.source_album_id, s.source_album_title, s.sort_order, s.created_at,
  (SELECT COUNT(*) FROM decisions d WHERE d.session_id = s.id) AS decision_count,
  (SELECT COUNT(*) FROM decisions d WHERE d.session_id = s.id AND d.action = 'trash') AS trash_count
`;

export async function getLatestOpenSession(db: SQLite.SQLiteDatabase): Promise<OpenSessionInfo | null> {
  return db.getFirstAsync<OpenSessionInfo>(
    `SELECT ${OPEN_SESSION_COLUMNS} FROM sessions s
     WHERE s.status = 'open' AND EXISTS (SELECT 1 FROM decisions d WHERE d.session_id = s.id)
     ORDER BY s.created_at DESC LIMIT 1`,
  );
}

export async function getOpenSessions(db: SQLite.SQLiteDatabase): Promise<OpenSessionInfo[]> {
  return db.getAllAsync<OpenSessionInfo>(
    `SELECT ${OPEN_SESSION_COLUMNS} FROM sessions s
     WHERE s.status = 'open' AND EXISTS (SELECT 1 FROM decisions d WHERE d.session_id = s.id)
     ORDER BY s.created_at DESC`,
  );
}

export async function getSessionRow(
  db: SQLite.SQLiteDatabase,
  id: string,
): Promise<OpenSessionInfo | null> {
  return db.getFirstAsync<OpenSessionInfo>(
    `SELECT ${OPEN_SESSION_COLUMNS} FROM sessions s WHERE s.id = ?`,
    id,
  );
}

/** 依建立順序取出該工作的全部決定，用於恢復 Map + 撤銷歷史 */
export async function getSessionDecisions(
  db: SQLite.SQLiteDatabase,
  sessionId: string,
): Promise<DecisionRow[]> {
  return db.getAllAsync<DecisionRow>(
    'SELECT asset_id, action, target_album_id, target_album_title, uri, width, height, applied, failed, last_error, created_at FROM decisions WHERE session_id = ? ORDER BY created_at ASC, id ASC',
    sessionId,
  );
}

/** 啟動時順手清理：從未留下任何分類的空白工作不應再打擾使用者 */
export async function abandonEmptySessions(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(
    "UPDATE sessions SET status = 'abandoned' WHERE status = 'open' AND id NOT IN (SELECT DISTINCT session_id FROM decisions)",
  );
}

export async function abandonSession(db: SQLite.SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync("UPDATE sessions SET status = 'abandoned' WHERE id = ?", id);
}

export async function finishSession(db: SQLite.SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(
    "UPDATE sessions SET status = 'finished', finished_at = ? WHERE id = ?",
    Date.now(),
    id,
  );
}

/** 設定頁「清除整理紀錄」：清掉工作與決定，保留相簿排序與偏好 */
export async function clearAllRecords(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('DELETE FROM decisions; DELETE FROM sessions;');
}

export async function getPref(db: SQLite.SQLiteDatabase, key: string, defaultValue: string = ''): Promise<string> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM prefs WHERE key = ?', key);
  return row ? row.value : defaultValue;
}

export async function setPref(db: SQLite.SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT INTO prefs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}
