import type * as SQLite from 'expo-sqlite';

/**
 * P4 底部相簿顯示順序（規格 §2.4）。
 * 只影響本 App 的顯示，不修改系統相簿排序。
 * 語意：固定的在前（依 sort_index），一般居中（依 sort_index），隱藏的不顯示。
 * 新出現的相簿自動接在最後並持久化，重開 App 仍保持相同順序。
 */
export interface AlbumEntry {
  id: string;
  title: string;
  pinned: boolean;
  hidden: boolean;
  sortIndex: number;
}

interface OrderRow {
  album_id: string;
  title: string;
  sort_index: number;
  hidden: number;
  pinned: number;
}

/** 新相簿補列、改名同步；冪等，可每次載入目標時呼叫 */
export async function ensureOrderRows(
  db: SQLite.SQLiteDatabase,
  albums: { id: string; title: string }[],
): Promise<void> {
  const rows = await db.getAllAsync<Pick<OrderRow, 'album_id' | 'title'>>(
    'SELECT album_id, title FROM album_order',
  );
  const known = new Map(rows.map((r) => [r.album_id, r.title]));
  const maxRow = await db.getFirstAsync<{ m: number | null }>(
    'SELECT MAX(sort_index) AS m FROM album_order',
  );
  let next = (maxRow?.m ?? -1) + 1;
  for (const a of albums) {
    if (!known.has(a.id)) {
      await db.runAsync(
        'INSERT INTO album_order (album_id, title, sort_index, hidden, pinned) VALUES (?, ?, ?, 0, 0)',
        a.id,
        a.title,
        next++,
      );
    } else if (known.get(a.id) !== a.title) {
      await db.runAsync('UPDATE album_order SET title = ? WHERE album_id = ?', a.title, a.id);
    }
  }
}

/** 以系統現存相簿為準，套用自訂順序；回傳顯示中與已隱藏兩組 */
export async function getAlbumEntries(
  db: SQLite.SQLiteDatabase,
  live: { id: string; title: string }[],
): Promise<{ visible: AlbumEntry[]; hidden: AlbumEntry[] }> {
  await ensureOrderRows(db, live);
  const titleOf = new Map(live.map((a) => [a.id, a.title]));
  const rows = await db.getAllAsync<OrderRow>(
    'SELECT album_id, title, sort_index, hidden, pinned FROM album_order',
  );
  const entries: AlbumEntry[] = [];
  for (const r of rows) {
    let title = titleOf.get(r.album_id);
    if (title === undefined && r.album_id.startsWith('virtual:')) {
      title = r.title;
    }
    if (title === undefined) continue; // 系統已無此相簿：保留列，不顯示
    entries.push({
      id: r.album_id,
      title,
      pinned: r.pinned === 1,
      hidden: r.hidden === 1,
      sortIndex: r.sort_index,
    });
  }
  // 防禦：若有現存相簿仍無列（競態），暫時接在最後
  for (const a of live) {
    if (!entries.some((e) => e.id === a.id)) {
      entries.push({ id: a.id, title: a.title, pinned: false, hidden: false, sortIndex: Number.MAX_SAFE_INTEGER });
    }
  }
  const byOrder = (x: AlbumEntry, y: AlbumEntry) => x.sortIndex - y.sortIndex;
  const visible = entries.filter((e) => !e.hidden).sort((x, y) => Number(y.pinned) - Number(x.pinned) || byOrder(x, y));
  const hidden = entries.filter((e) => e.hidden).sort(byOrder);
  return { visible, hidden };
}

/** 在同群組（固定/一般）內上移或下移一位，交換 sort_index */
export async function moveEntry(db: SQLite.SQLiteDatabase, id: string, dir: -1 | 1): Promise<void> {
  const self = await db.getFirstAsync<Pick<OrderRow, 'pinned'>>(
    'SELECT pinned FROM album_order WHERE album_id = ?',
    id,
  );
  if (!self) return;
  const group = await db.getAllAsync<Pick<OrderRow, 'album_id' | 'sort_index'>>(
    'SELECT album_id, sort_index FROM album_order WHERE hidden = 0 AND pinned = ? ORDER BY sort_index ASC',
    self.pinned,
  );
  const i = group.findIndex((g) => g.album_id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= group.length) return;
  const a = group[i];
  const b = group[j];
  await db.runAsync('UPDATE album_order SET sort_index = ? WHERE album_id = ?', b.sort_index, a.album_id);
  await db.runAsync('UPDATE album_order SET sort_index = ? WHERE album_id = ?', a.sort_index, b.album_id);
}

export async function setPinned(db: SQLite.SQLiteDatabase, id: string, pinned: boolean): Promise<void> {
  await db.runAsync('UPDATE album_order SET pinned = ? WHERE album_id = ?', pinned ? 1 : 0, id);
}

export async function setHidden(db: SQLite.SQLiteDatabase, id: string, hidden: boolean): Promise<void> {
  await db.runAsync('UPDATE album_order SET hidden = ? WHERE album_id = ?', hidden ? 1 : 0, id);
}
