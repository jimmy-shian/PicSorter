export interface DropRect { x: number; y: number; width: number; height: number }

/** 與等寬 flex 快捷列一致，空位不佔寬度，項目間距不算拖曳目標。 */
export function albumDropRects(ids: string[], bounds: DropRect, gap: number): Map<string, DropRect> {
  const rects = new Map<string, DropRect>();
  if (!ids.length) return rects;
  const width = Math.max(0, (bounds.width - gap * (ids.length - 1)) / ids.length);
  ids.forEach((id, index) => rects.set(id, {
    ...bounds, x: bounds.x + index * (width + gap), width,
  }));
  return rects;
}

export function hitAlbum(rects: Map<string, DropRect>, x: number, y: number): string | null {
  for (const [id, rect] of rects) {
    if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) return id;
  }
  return null;
}

/** 48dp 啟動、64dp 停止；速度連續增加，離開邊緣區後逐漸減速。 */
export function edgeScroll(finger: number, top: number, height: number, previous: number) {
  const upper = finger - top;
  const lower = top + height - finger;
  const zone = Math.min(48, height / 3);
  const exit = Math.min(64, height / 2);
  const direction = previous < 0 && upper < exit ? -1 : previous > 0 && lower < exit ? 1
    : upper < zone ? -1 : lower < zone ? 1 : 0;
  const distance = direction < 0 ? upper : lower;
  const strength = Math.max(0, Math.min(1, (zone - distance) / zone));
  return { direction, velocity: direction * (30 + 450 * strength * strength) };
}

/** 越過相鄰列的中心才換位，額外 4dp 緩衝避免邊界來回交換。 */
export function reorderIndex(y: number, rowHeight: number, current: number, count: number) {
  let next = current;
  while (next < count - 1 && y > (next + 0.5) * rowHeight + 4) next++;
  while (next > 0 && y < (next - 0.5) * rowHeight - 4) next--;
  return next;
}
