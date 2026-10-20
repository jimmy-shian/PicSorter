import type { SQLiteDatabase } from 'expo-sqlite';
import type { TargetAlbum } from '@/types';
import { getPref, setPref } from './db';
import { normalizeGestureDraft, parseShortcutIds, type GestureAlbumDraft } from './gesture-albums';

/** 缺少設定才做一次舊版初始化；空陣列代表使用者刻意清空。 */
export async function loadGestureAlbumSettings(db: SQLiteDatabase, available: TargetAlbum[]) {
  const savedUp = await getPref(db, 'up_target_id', '__legacy__');
  const upId = savedUp === '__legacy__' ? available[0]?.id ?? null : available.find((e) => e.id === savedUp)?.id ?? null;
  const savedShortcuts = await getPref(db, 'down_shortcut_ids', '__legacy__');
  const ids = savedShortcuts === '__legacy__' ? available.slice(1, 5).map((e) => e.id) : parseShortcutIds(savedShortcuts);
  if (savedShortcuts === '__legacy__') await setPref(db, 'down_shortcut_ids', JSON.stringify(ids));
  const shortcutIds = normalizeGestureDraft({
    entries: available.map((album, sortIndex) => ({ ...album, sortIndex, pinned: false, hidden: false })),
    shortcutIds: ids, upId: null, downId: null,
  }).shortcutIds;
  const savedDown = await getPref(db, 'down_target_id');
  const downId = available.some((album) => album.id === savedDown) ? savedDown : shortcutIds.find(Boolean) ?? null;
  // 有效性檢查只作用在目前來源的可用目標，不因切換來源而覆寫全域偏好。
  return { upId, shortcutIds, downId };
}

/** 批次成功與逐張重試共用，避免相簿實體化後留下失效的手勢與快捷 ID。 */
export async function replaceVirtualAlbumId(db: SQLiteDatabase, virtualId: string, realId: string) {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync('UPDATE album_order SET album_id = ? WHERE album_id = ?', realId, virtualId);
    await transaction.runAsync('UPDATE decisions SET target_album_id = ? WHERE target_album_id = ?', realId, virtualId);
    for (const key of ['up_target_id', 'down_target_id']) {
      if (await getPref(transaction, key) === virtualId) await setPref(transaction, key, realId);
    }
    const shortcuts = await getPref(transaction, 'down_shortcut_ids');
    const ids = parseShortcutIds(shortcuts);
    if (ids.includes(virtualId)) {
      await setPref(transaction, 'down_shortcut_ids', JSON.stringify(ids.map((id) => id === virtualId ? realId : id)));
    }
  });
}

export async function saveGestureAlbumSettings(db: SQLiteDatabase, draft: GestureAlbumDraft) {
  const next = normalizeGestureDraft(draft);
  await db.withExclusiveTransactionAsync(async (transaction) => {
    for (const entry of next.entries) {
      await transaction.runAsync(
        'INSERT INTO album_order (album_id, title, sort_index, pinned, hidden) VALUES (?, ?, ?, ?, ?) ON CONFLICT(album_id) DO UPDATE SET title = excluded.title, sort_index = excluded.sort_index, pinned = excluded.pinned, hidden = excluded.hidden',
        entry.id, entry.title, entry.sortIndex, Number(entry.pinned), Number(entry.hidden),
      );
    }
    await setPref(transaction, 'up_target_id', next.upId ?? '');
    await setPref(transaction, 'down_shortcut_ids', JSON.stringify(next.shortcutIds));
    await setPref(transaction, 'down_target_id', next.downId ?? '');
  });
}
