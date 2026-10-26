import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, LayoutAnimation, Pressable,
  ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import type { AlbumEntry } from '@/lib/album-order';
import { edgeScroll, reorderIndex } from '@/lib/drag-geometry';
import { albumDisplayGroups, reorderAlbumGroup } from '@/lib/gesture-albums';
import { useTheme } from '@/lib/theme';
import { EyeIcon, EyeOffIcon, PinIcon } from './GestureIcons';
import { ShortcutSlotModal } from './ShortcutSlotModal';

interface Props {
  entries: AlbumEntry[];
  keyword: string;
  onChange: (entries: AlbumEntry[]) => void;
  onHidden: (entry: AlbumEntry) => void;
  shortcutIds: string[];
  onAssignShortcut: (id: string, slotIndex: number) => void;
  onClearShortcut: (id: string) => void;
}

interface DragState {
  id: string;
  pinned: boolean;
  original: AlbumEntry[];
  startY: number;
  startScroll: number;
  dy: number;
  fingerY: number;
  edge: number;
  velocity: number;
}

function ManagerRow({
  entry,
  y,
  height,
  active,
  disabled,
  reduceMotion,
  onStart,
  onMove,
  onEnd,
  onStep,
  onPin,
  onHidden,
  shortcutIndex,
  onOpenShortcut,
}: {
  shortcutIndex: number;
  onOpenShortcut: () => void;
  entry: AlbumEntry;
  y: number;
  height: number;
  active: boolean;
  disabled: boolean;
  reduceMotion: boolean;
  onStart: () => void;
  onMove: (dy: number, fingerY: number) => void;
  onEnd: (cancel: boolean) => void;
  onStep: (direction: number) => void;
  onPin: () => void;
  onHidden: () => void;
}) {
  const { text, muted, card, border } = useTheme();
  const [position] = useState(() => new Animated.Value(y));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const started = useRef(false);
  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  useEffect(() => {
    if (active || reduceMotion) {
      position.setValue(y);
      return;
    }
    const animation = Animated.timing(position, { toValue: y, duration: 180, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [active, position, reduceMotion, y]);
  const touchStart = useRef(0);
  const finish = (cancel: boolean) => {
    clearTimer();
    if (started.current) onEnd(cancel);
    started.current = false;
  };

  return (
    <Animated.View
      style={[
        styles.row,
        {
          height,
          transform: [{ translateY: position }, { scale: active && !reduceMotion ? 1.02 : 1 }],
          zIndex: active ? 20 : 1,
          backgroundColor: active ? card : 'transparent',
          borderColor: border,
          borderWidth: active ? 1 : 0,
          borderBottomWidth: StyleSheet.hairlineWidth,
          elevation: active ? 6 : 0,
        },
      ]}>
      {/* 手指明確按在 ☷ 把手才啟動垂直拖曳，不影響清單其他區域的自然捲動 */}
      <View
        style={styles.icon}
        accessible
        accessibilityRole="adjustable"
        onStartShouldSetResponder={() => !disabled && !entry.hidden}
        onResponderGrant={(event) => {
          touchStart.current = event.nativeEvent.pageY;
          started.current = false;
          timer.current = setTimeout(() => {
            started.current = true;
            onStart();
          }, 200);
        }}
        onResponderMove={(event) => {
          if (event.nativeEvent.touches.length !== 1) {
            finish(true);
            return;
          }
          const dy = event.nativeEvent.pageY - touchStart.current;
          if (started.current) onMove(dy, event.nativeEvent.pageY);
          else if (Math.abs(dy) > 8) clearTimer();
        }}
        onResponderTerminationRequest={() => !started.current}
        onResponderRelease={() => finish(false)}
        onResponderTerminate={() => finish(true)}
        accessibilityLabel={`拖曳調整 ${entry.title} 順序`}
        accessibilityState={{ disabled: disabled || entry.hidden }}
        accessibilityHint={entry.hidden ? '恢復顯示後可調整順序' : '長按拖曳，或使用上移與下移動作'}
        accessibilityActions={entry.hidden ? [] : [{ name: 'increment', label: '下移' }, { name: 'decrement', label: '上移' }]}
        onAccessibilityAction={(event) => onStep(event.nativeEvent.actionName === 'increment' ? 1 : -1)}>
        <Text style={{ color: muted, fontSize: 24 }}>☷</Text>
      </View>
      <View style={styles.name}>
        <Text numberOfLines={1} style={{ color: entry.hidden ? muted : text, fontSize: 15, fontWeight: '500' }}>
          {entry.title}
        </Text>
        {entry.hidden && <Text style={{ color: muted, fontSize: 12 }}>隱藏</Text>}
      </View>
      <View style={styles.actions}>
        <Pressable
          disabled={disabled || entry.hidden}
          onPress={onOpenShortcut}
          accessibilityRole="button"
          accessibilityLabel={`設定快捷位置：${entry.title}，目前${shortcutIndex >= 0 ? `為快捷 ${shortcutIndex + 1}` : '未設'}`}
          accessibilityState={{ disabled: disabled || entry.hidden }}
          style={styles.shortcutTouch}>
          <View
            style={[
              styles.shortcutBadge,
              {
                borderColor: shortcutIndex >= 0 ? '#168BFF' : border,
                backgroundColor: shortcutIndex >= 0 ? '#168bff20' : 'transparent',
              },
            ]}>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
              style={{
                color: shortcutIndex >= 0 ? text : muted,
                fontSize: 11,
                fontWeight: shortcutIndex >= 0 ? '600' : '400',
              }}>
              {shortcutIndex >= 0 ? `${shortcutIndex + 1}` : '未設'}
            </Text>
          </View>
        </Pressable>
        <Pressable
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ selected: entry.pinned, disabled }}
          accessibilityLabel={`${entry.pinned ? '取消固定' : '固定'} ${entry.title}`}
          style={styles.icon}
          onPress={onPin}>
          <PinIcon size={21} color={entry.pinned ? '#168BFF' : muted} pinned={entry.pinned} />
        </Pressable>
        <Pressable
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          accessibilityLabel={`${entry.hidden ? '顯示' : '隱藏'} ${entry.title}`}
          style={styles.icon}
          onPress={onHidden}>
          {entry.hidden ? <EyeOffIcon size={21} color={muted} /> : <EyeIcon size={21} color="#168BFF" />}
        </Pressable>
      </View>
    </Animated.View>
  );
}

export function AlbumManagerList({
  entries,
  keyword,
  onChange,
  onHidden,
  shortcutIds,
  onAssignShortcut,
  onClearShortcut,
}: Props) {
  const { text, muted, border, card } = useTheme();
  const { fontScale } = useWindowDimensions();
  const height = Math.max(44, Math.ceil(40 * fontScale));
  const [drag, setDrag] = useState<{ id: string; y: number } | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [modalEntry, setModalEntry] = useState<AlbumEntry | null>(null);

  const scroll = useRef<ScrollView>(null);
  const viewportRef = useRef<View>(null);
  const offset = useRef(0);
  const contentHeight = useRef(0);
  const viewport = useRef({ y: 0, height: 0 });
  const dragRef = useRef<DragState | null>(null);
  const entriesRef = useRef(entries);
  useLayoutEffect(() => {
    offset.current = 0;
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [keyword]);
  useLayoutEffect(() => {
    entriesRef.current = entries;
  }, [entries]);
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setReduceMotion(value);
    });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      alive = false;
      listener.remove();
    };
  }, []);
  const sortedGroup = (list: AlbumEntry[], pinned: boolean) =>
    albumDisplayGroups(list, keyword)[pinned ? 'pinned' : 'normal'];

  const move = (dy: number, fingerY: number) => {
    const state = dragRef.current;
    if (!state) return;
    state.dy = dy;
    state.fingerY = fingerY;
    const group = sortedGroup(entriesRef.current, state.pinned);
    const ids = group.map((e) => e.id);
    if (!ids.includes(state.id)) return;
    const y = Math.max(0, Math.min((ids.length - 1) * height, state.startY + dy + offset.current - state.startScroll));
    const target = Math.max(0, Math.min(ids.length - 1, reorderIndex(y, height, ids.indexOf(state.id), ids.length)));
    const current = ids.indexOf(state.id);
    if (target !== current) {
      ids.splice(current, 1);
      ids.splice(target, 0, state.id);
      const next = reorderAlbumGroup(entriesRef.current, ids);
      entriesRef.current = next;
      onChangeRef.current(next);
    }
    setDrag({ id: state.id, y });
  };
  const moveRef = useRef(move);
  useLayoutEffect(() => {
    moveRef.current = move;
  });
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.min(0.05, (now - last) / 1000);
      last = now;
      const state = dragRef.current;
      if (!state || !state.fingerY) return;
      const { y, height: visibleHeight } = viewport.current;
      const edge = edgeScroll(state.fingerY, y, visibleHeight, state.edge);
      state.edge = edge.direction;
      state.velocity += (edge.velocity - state.velocity) * Math.min(1, elapsed * 12);
      if (Math.abs(state.velocity) < 1) return;
      const next = Math.max(
        0,
        Math.min(Math.max(0, contentHeight.current - visibleHeight), offset.current + state.velocity * elapsed),
      );
      if (next === offset.current) {
        state.velocity = 0;
        return;
      }
      offset.current = next;
      scroll.current?.scrollTo({ y: next, animated: false });
      moveRef.current(state.dy, state.fingerY);
    }, 16);
    return () => clearInterval(timer);
  }, [dragging]);

  const animate = () => {
    if (!reduceMotion) LayoutAnimation.configureNext({ ...LayoutAnimation.Presets.easeInEaseOut, duration: 220 });
  };
  const pinnedGroup = sortedGroup(entries, true);
  const normalGroup = sortedGroup(entries, false);
  const hiddenGroup = albumDisplayGroups(entries, keyword).hidden;
  const pinnedStart = Math.ceil(60 * Math.max(1, fontScale));
  const normalHeader = pinnedStart + Math.max(pinnedGroup.length * height, 24) + Math.ceil(24 * Math.max(1, fontScale));
  const normalStart = normalHeader + Math.ceil(44 * Math.max(1, fontScale));
  const hiddenHeader = normalStart + normalGroup.length * height + 24;
  const hiddenStart = hiddenHeader + Math.ceil(44 * Math.max(1, fontScale));

  return (
    <View
      ref={viewportRef}
      style={styles.list}
      onLayout={() =>
        viewportRef.current?.measure((_, __, ___, visibleHeight, ____, pageY) => {
          viewport.current = { y: pageY, height: visibleHeight };
        })
      }>
      <ScrollView
        ref={scroll}
        style={styles.list}
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!drag}
        onContentSizeChange={(_, h) => {
          contentHeight.current = h;
        }}
        onScroll={(event) => {
          if (!dragRef.current) offset.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}>
        <View
          style={{
            height: hiddenGroup.length
              ? hiddenStart + hiddenGroup.length * height + 8
              : normalStart + normalGroup.length * height + 8,
          }}>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: pinnedStart + Math.max(pinnedGroup.length * height, 24),
              borderRadius: 15,
              backgroundColor: card,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: normalHeader,
              left: 0,
              right: 0,
              height: normalStart - normalHeader + normalGroup.length * height,
              borderRadius: 15,
              backgroundColor: card,
            }}
          />
          <View
            style={[
              styles.section,
              {
                borderBottomColor: border,
                borderBottomWidth: StyleSheet.hairlineWidth,
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: pinnedStart,
              },
            ]}>
            <View style={{ gap: 2 }}>
              <View style={styles.sectionTitle}>
                <Text style={{ color: text, fontSize: 15, fontWeight: '600' }}>固定</Text>
                <Text style={[styles.count, { color: muted, backgroundColor: border }]}>{pinnedGroup.length}</Text>
              </View>
              <Text style={{ color: muted, fontSize: 11 }}>固定在最前方</Text>
            </View>
          </View>
          {pinnedGroup.length === 0 && (
            <Text style={{ position: 'absolute', top: pinnedStart, left: 12, color: muted, fontSize: 12 }}>
              尚未固定任何相簿
            </Text>
          )}
          <View
            style={[
              styles.section,
              {
                borderBottomColor: border,
                borderBottomWidth: StyleSheet.hairlineWidth,
                position: 'absolute',
                top: normalHeader,
                left: 0,
                right: 0,
                height: normalStart - normalHeader,
              },
            ]}>
            <View style={styles.sectionTitle}>
              <Text style={{ color: text, fontSize: 15, fontWeight: '600' }}>其他相簿</Text>
              <Text style={[styles.count, { color: muted, backgroundColor: border }]}>{normalGroup.length}</Text>
            </View>
          </View>
          {hiddenGroup.length > 0 && (
            <>
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: hiddenHeader,
                  left: 0,
                  right: 0,
                  height: hiddenStart - hiddenHeader + hiddenGroup.length * height,
                  borderRadius: 15,
                  backgroundColor: card,
                }}
              />
              <View
                style={[
                  styles.section,
                  {
                    position: 'absolute',
                    top: hiddenHeader,
                    left: 0,
                    right: 0,
                    height: hiddenStart - hiddenHeader,
                  },
                ]}>
                <View style={styles.sectionTitle}>
                  <Text style={{ color: text, fontSize: 15, fontWeight: '600' }}>已隱藏</Text>
                  <Text style={[styles.count, { color: muted, backgroundColor: border }]}>{hiddenGroup.length}</Text>
                </View>
              </View>
            </>
          )}
          {drag && (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: pinnedGroup.some((e) => e.id === drag.id)
                  ? pinnedStart + pinnedGroup.findIndex((e) => e.id === drag.id) * height
                  : normalStart + normalGroup.findIndex((e) => e.id === drag.id) * height,
                left: 0,
                right: 0,
                height,
                borderRadius: 14,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: border,
              }}
            />
          )}
          {[...pinnedGroup, ...normalGroup, ...hiddenGroup].map((entry) => {
            const pinned = entry.pinned;
            const group = entry.hidden ? hiddenGroup : pinned ? pinnedGroup : normalGroup;
            const index = group.findIndex((e) => e.id === entry.id);
            const groupStart = entry.hidden ? hiddenStart : pinned ? pinnedStart : normalStart;
            return (
              <ManagerRow
                key={entry.id}
                entry={entry}
                y={groupStart + (drag?.id === entry.id ? drag.y : index * height)}
                shortcutIndex={shortcutIds.indexOf(entry.id)}
                onOpenShortcut={() => setModalEntry(entry)}
                height={height}
                active={drag?.id === entry.id}
                disabled={!!drag}
                reduceMotion={reduceMotion}
                onStart={() => {
                  if (entry.hidden) return;
                  dragRef.current = {
                    id: entry.id,
                    pinned,
                    original: entriesRef.current,
                    startY: index * height,
                    startScroll: offset.current,
                    dy: 0,
                    fingerY: 0,
                    edge: 0,
                    velocity: 0,
                  };
                  setDrag({ id: entry.id, y: index * height });
                  AccessibilityInfo.announceForAccessibility(`開始移動 ${entry.title}`);
                }}
                onMove={move}
                onEnd={(cancel) => {
                  if (cancel && dragRef.current) onChange(dragRef.current.original);
                  dragRef.current = null;
                  setDrag(null);
                }}
                onStep={(direction) => {
                  if (drag || entry.hidden) return;
                  const ids = group.map((e) => e.id);
                  const target = index + direction;
                  if (target < 0 || target >= ids.length) return;
                  [ids[index], ids[target]] = [ids[target], ids[index]];
                  onChange(reorderAlbumGroup(entries, ids));
                  AccessibilityInfo.announceForAccessibility(`${entry.title}，第 ${target + 1} 位`);
                }}
                onPin={() => {
                  animate();
                  onChange(entries.map((e) => (e.id === entry.id ? { ...e, pinned: !e.pinned } : e)));
                }}
                onHidden={() => onHidden(entry)}
              />
            );
          })}
        </View>
        {pinnedGroup.length + normalGroup.length + hiddenGroup.length === 0 && (
          <Text style={{ color: text, paddingVertical: 24 }}>
            {keyword.trim() ? '找不到符合的相簿' : '沒有可管理的相簿'}
          </Text>
        )}
        <View style={{ borderBottomColor: border, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 8 }} />
      </ScrollView>

      {/* 快捷位置選擇/互換彈窗 */}
      <ShortcutSlotModal
        visible={modalEntry !== null}
        entry={modalEntry}
        shortcutIds={shortcutIds}
        allEntries={entries}
        onAssign={(slotIndex) => {
          if (modalEntry) onAssignShortcut(modalEntry.id, slotIndex);
        }}
        onClear={() => {
          if (modalEntry) onClearShortcut(modalEntry.id);
        }}
        onClose={() => setModalEntry(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, minHeight: 0 },
  section: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  row: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingRight: 4 },
  icon: { width: 36, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, minWidth: 0, paddingRight: 4, gap: 1 },
  actions: { flexDirection: 'row', gap: 0, flexShrink: 0 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  count: { fontSize: 11, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 1, overflow: 'hidden' },
  shortcutTouch: { minWidth: 40, minHeight: 40, justifyContent: 'center', alignItems: 'center' },
  shortcutBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3, minWidth: 26, alignItems: 'center', justifyContent: 'center' },
});
