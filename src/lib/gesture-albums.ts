import type { AlbumEntry } from './album-order';

/** 只篩選顯示資料，不改原始排序；隱藏相簿永遠獨立置底。 */
export function albumDisplayGroups(entries: AlbumEntry[], keyword = '') {
  const query = keyword.trim().toLocaleLowerCase();
  const matches = entries.filter((entry) => entry.title.toLocaleLowerCase().includes(query))
    .sort((a, b) => a.sortIndex - b.sortIndex);
  return {
    pinned: matches.filter((entry) => !entry.hidden && entry.pinned),
    normal: matches.filter((entry) => !entry.hidden && !entry.pinned),
    hidden: matches.filter((entry) => entry.hidden),
  };
}

export interface GestureAlbumDraft {
  entries: AlbumEntry[];
  upId: string | null;
  shortcutIds: string[];
  downId: string | null;
}

/** 一般排序、快捷順位與目前手勢目標各自獨立。 */
export function normalizeGestureDraft(draft: GestureAlbumDraft): GestureAlbumDraft {
  const available = new Set(draft.entries.filter((e) => !e.hidden).map((e) => e.id));
  const shortcutIds = [...new Set(draft.shortcutIds)].filter((id) => available.has(id)).slice(0, 4);
  return {
    ...draft,
    upId: draft.upId && available.has(draft.upId) ? draft.upId : null,
    shortcutIds,
    downId: draft.downId && available.has(draft.downId) ? draft.downId : shortcutIds[0] ?? null,
  };
}

export function toggleShortcut(draft: GestureAlbumDraft, id: string): GestureAlbumDraft {
  if (!draft.shortcutIds.includes(id) && draft.shortcutIds.length >= 4) return draft;
  return normalizeGestureDraft({ ...draft, shortcutIds: draft.shortcutIds.includes(id)
    ? draft.shortcutIds.filter((key) => key !== id) : [...draft.shortcutIds, id] });
}

export function parseShortcutIds(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? [...new Set(parsed.filter((id): id is string => typeof id === 'string'))].slice(0, 4) : [];
  } catch { return []; }
}

/** 共用一般排序索引，跨固定群組只用 Pin；不影響快捷順位。 */
export function reorderAlbumGroup(entries: AlbumEntry[], ids: string[]): AlbumEntry[] {
  const positions = entries.filter((e) => ids.includes(e.id)).map((e) => e.sortIndex).sort((a, b) => a - b);
  return entries.map((e) => {
    const index = ids.indexOf(e.id);
    return index < 0 ? e : { ...e, sortIndex: positions[index] };
  });
}

