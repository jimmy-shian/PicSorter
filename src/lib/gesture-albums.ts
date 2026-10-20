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

/** 空字串代表未指定的位置；只移除尾端空位，保留中間的快捷編號。 */
function normalizeShortcutSlots(ids: string[], available?: Set<string>): string[] {
  const seen = new Set<string>();
  const slots = ids.slice(0, 4).map((id) => {
    if (!id || seen.has(id) || (available && !available.has(id))) return '';
    seen.add(id);
    return id;
  });
  while (slots.length && !slots[slots.length - 1]) slots.pop();
  return slots;
}

/** 一般排序、快捷順位與目前手勢目標各自獨立。 */
export function normalizeGestureDraft(draft: GestureAlbumDraft): GestureAlbumDraft {
  const available = new Set(draft.entries.filter((e) => !e.hidden).map((e) => e.id));
  const shortcutIds = normalizeShortcutSlots(draft.shortcutIds, available);
  return {
    ...draft,
    upId: draft.upId && available.has(draft.upId) ? draft.upId : null,
    shortcutIds,
    downId: draft.downId && available.has(draft.downId) ? draft.downId : shortcutIds.find(Boolean) ?? null,
  };
}

export function toggleShortcut(draft: GestureAlbumDraft, id: string): GestureAlbumDraft {
  if (!draft.shortcutIds.includes(id) && draft.shortcutIds.length >= 4) return draft;
  return normalizeGestureDraft({
    ...draft,
    shortcutIds: draft.shortcutIds.includes(id)
      ? draft.shortcutIds.filter((key) => key !== id)
      : [...draft.shortcutIds, id],
  });
}

export function assignShortcutSlot(
  draft: GestureAlbumDraft,
  id: string,
  slotIndex: number,
): GestureAlbumDraft {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= 4) return draft;
  const currentShortcuts = [...normalizeGestureDraft(draft).shortcutIds];
  while (currentShortcuts.length <= slotIndex) currentShortcuts.push('');
  const oldSlotOfTarget = currentShortcuts.indexOf(id);
  if (oldSlotOfTarget >= 0) currentShortcuts[oldSlotOfTarget] = currentShortcuts[slotIndex];
  currentShortcuts[slotIndex] = id;
  return normalizeGestureDraft({ ...draft, shortcutIds: currentShortcuts });
}

export function clearShortcut(draft: GestureAlbumDraft, id: string): GestureAlbumDraft {
  return normalizeGestureDraft({
    ...draft,
    shortcutIds: draft.shortcutIds.map((s) => s === id ? '' : s),
  });
}

export function parseShortcutIds(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? normalizeShortcutSlots(parsed.filter((id): id is string => typeof id === 'string'))
      : [];
  } catch {
    return [];
  }
}

/** 共用一般排序索引，跨固定群組只用 Pin；不影響快捷順位。 */
export function reorderAlbumGroup(entries: AlbumEntry[], ids: string[]): AlbumEntry[] {
  const positions = entries.filter((e) => ids.includes(e.id)).map((e) => e.sortIndex).sort((a, b) => a - b);
  return entries.map((e) => {
    const index = ids.indexOf(e.id);
    return index < 0 ? e : { ...e, sortIndex: positions[index] };
  });
}
