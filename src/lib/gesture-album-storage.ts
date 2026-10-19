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
  const shortcutIds = ids.filter((id) => available.some((e) => e.id === id));
  const savedDown = await getPref(db, 'down_target_id');
  const downId = available.some((album) => album.id === savedDown) ? savedDown : shortcutIds[0] ?? null;
  // 有效性檢查只作用在目前來源的可用目標，不因切換來源而覆寫全域偏好。
  return { upId, shortcutIds, downId };
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
