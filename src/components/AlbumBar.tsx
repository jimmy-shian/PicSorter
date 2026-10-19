import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';
import { GestureAlbumSheet } from './GestureAlbumSheet';
import { hitAlbum, type DropRect } from '@/lib/drag-geometry';
import type { TargetAlbum } from '@/types';

const ACCENT = '#168BFF';
export type ChipRect = DropRect;
export interface AlbumBarHandle {
  refreshLayout: () => void;
  setViewport: (rect: DropRect) => void;
  setPointer: (point: { x: number; y: number } | null) => void;
  getDropTarget: (point: { x: number; y: number }) => Promise<string | null>;
}
interface Props {
  targets: TargetAlbum[];
  selectedId: string | null;
  downTargetId?: string | null;
  shortcutIds: string[];
  onClassify: (id: string) => Promise<void>;
  /** 長按晶片：通知父層顯示完整相簿名稱（頂部通知），不觸發分類 */
  onLongPress: (id: string) => void;
  sourceId: string | null;
  onOrderChanged: () => void | Promise<void>;
  dropMode: boolean;
  highlightId: string | null;
  onHover: (id: string | null) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}

function AlbumTarget({ album, index, hover, selected, dropMode, onPress, onLongPress }: {
  album: TargetAlbum | null; index: number; hover: boolean; selected: boolean; dropMode: boolean; onPress: () => void; onLongPress: (id: string) => void;
}) {
  const { text, muted, border, card } = useTheme();
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(hover ? 1.08 : 1, { duration: 120 }) }],
    zIndex: hover ? 10 : 1,
  }));
  return <Animated.View style={[styles.slot, style]}>
    <Pressable onPress={onPress}
      onLongPress={album ? () => onLongPress(album.id) : undefined}
      delayLongPress={350}
      disabled={dropMode} accessibilityRole="button"
      accessibilityLabel={album ? `快捷 ${index + 1}：${album.title}${selected ? '，目前下滑目標' : ''}，點選分類或拖曳照片放入` : `設定快捷 ${index + 1}`}
      accessibilityHint={album ? '長按顯示完整相簿名稱' : undefined}
      accessibilityState={{ selected }}
      style={[styles.album, {
        borderColor: hover ? ACCENT : selected ? ACCENT : border,
        borderWidth: hover ? 2.5 : selected ? 1.5 : StyleSheet.hairlineWidth,
        backgroundColor: hover ? '#168bff33' : selected ? '#168bff14' : card,
        shadowColor: hover ? ACCENT : 'transparent',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: hover ? 0.35 : 0,
        shadowRadius: 5,
        elevation: hover ? 4 : 0,
      }]}>
      <Text numberOfLines={1} ellipsizeMode="tail" style={{
        color: hover ? ACCENT : album ? text : muted,
        fontSize: 13,
        fontWeight: hover ? '700' : '500',
      }}>
        {album?.title.trim() || '未設定'}
      </Text>
    </Pressable>
  </Animated.View>;
}

export const AlbumBar = forwardRef<AlbumBarHandle, Props>(function AlbumBar(props, ref) {
  const { text, muted, border } = useTheme();
  const { onHover } = props;
  const [sheetVisible, setSheetVisible] = useState(false);
  const [anchor, setAnchor] = useState<'up' | 'down'>('up');
  const row = useRef<View>(null);
  const bounds = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const slots = Array.from({ length: 4 }, (_, index) => props.targets.find((album) => album.id === props.shortcutIds[index]) ?? null);
  const layout = useRef(slots);
  useLayoutEffect(() => { layout.current = slots; });
  const measure = useCallback(() => {
    row.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        bounds.current = { x, y, width, height };
      }
    });
  }, []);
  useEffect(() => {
    measure();
  }, [measure, props.dropMode, props.targets, props.shortcutIds]);

  const hitTarget = useCallback((point: { x: number; y: number }) => {
    const b = bounds.current;
    if (b.width === 0 || b.height === 0) return null;
    // 增加垂直容差：上方預留 45dp，下方涵蓋到螢幕邊緣（70dp），使手指移近按鈕時即可精準命中
    const hitTop = b.y - 45;
    const hitBottom = b.y + b.height + 70;
    if (point.y < hitTop || point.y > hitBottom) return null;

    const slotWidth = b.width / 4;
    const rects = new Map<string, DropRect>();
    layout.current.forEach((album, index) => {
      if (album) {
        rects.set(album.id, {
          x: b.x + index * slotWidth,
          y: hitTop,
          width: slotWidth,
          height: hitBottom - hitTop,
        });
      }
    });
    return hitAlbum(rects, point.x, point.y);
  }, []);

  useImperativeHandle(ref, () => ({
    refreshLayout: measure,
    setViewport: () => {},
    setPointer: (point) => onHover(point ? hitTarget(point) : null),
    getDropTarget: async (point) => hitTarget(point),
  }), [hitTarget, onHover, measure]);
  const open = (direction: 'up' | 'down') => { setAnchor(direction); setSheetVisible(true); };
  const up = props.targets.find((album) => album.id === props.selectedId)?.title ?? '未設定';
  return <>
    <View style={styles.wrap}>
      <Pressable disabled={props.dropMode} accessibilityRole="button" accessibilityLabel={`上滑目標：${up}，編輯分類手勢`}
        style={[styles.gestures, { borderBottomColor: border }]} onPress={() => open('up')}>
        <Text style={{ color: muted, fontSize: 11 }}>↑ 上滑</Text>
        <Text numberOfLines={1} style={[styles.directionText, { color: text }]}>{up}</Text>
        <Text style={{ color: props.dropMode ? ACCENT : muted, fontSize: 11 }}>{props.dropMode ? '放開分類' : '編輯'}</Text>
      </Pressable>
      <View ref={row} collapsable={false} style={styles.albums} onLayout={measure}>
        {slots.map((album, index) => <AlbumTarget key={index} album={album} index={index}
          selected={album !== null && props.downTargetId === album.id}
          hover={album !== null && props.highlightId === album.id} dropMode={props.dropMode}
          onPress={() => { if (album) void props.onClassify(album.id); else open('down'); }}
          onLongPress={props.onLongPress} />)}
      </View>
    </View>
    {(sheetVisible || props.expanded) && <GestureAlbumSheet visible sourceId={props.sourceId} anchor={anchor} upId={props.selectedId}
      downId={props.downTargetId ?? null} shortcutIds={props.shortcutIds}
      onClose={() => { setSheetVisible(false); if (props.expanded) props.onToggleExpand(); }} onSaved={props.onOrderChanged} />}
  </>;
});
const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingBottom: 4, gap: 4 },
  gestures: { flexDirection: 'row', alignItems: 'center', minHeight: 32, gap: 8, paddingHorizontal: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  directionText: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '500' },
  albums: { flexDirection: 'row', alignItems: 'stretch', gap: 6 },
  slot: { flex: 1, minWidth: 0 },
  album: { flex: 1, minHeight: 40, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 7, justifyContent: 'center', alignItems: 'center' },
});
