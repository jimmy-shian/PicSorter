import { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, type PanResponderInstance } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useTheme } from '@/lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listTargetAlbums } from '@/lib/media';
import {
  getAlbumEntries,
  moveEntry,
  setHidden,
  setPinned,
  type AlbumEntry,
} from '@/lib/album-order';
import { EyeIcon, EyeOffIcon, PinIcon } from '@/components/GestureIcons';

interface Props {
  visible: boolean;
  /** 目前來源相簿 id：與底部列一致，排除來源本身作為目標 */
  sourceId: string | null;
  onClose: () => void;
  /** 任一變更後通知父層重載底部列 */
  onChanged: () => void;
}

function DraggableRow({
  disabled,
  onDrop,
  onDragState,
  children,
}: {
  disabled: boolean;
  onDrop: (dy: number) => void;
  onDragState?: (dragging: boolean) => void;
  children: (dragHandlers: PanResponderInstance['panHandlers']) => React.ReactNode;
}) {
  const [translateY, setTranslateY] = useState(0);
  const responder = useMemo(
    () =>
      PanResponder.create({
        // 手指明確按在 ☷ 把手才啟動垂直拖曳，不影響清單其他區域的自然捲動
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: (_event, gesture) => !disabled && Math.abs(gesture.dy) > 4,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          onDragState?.(true);
        },
        onPanResponderMove: (_event, gesture) => setTranslateY(gesture.dy),
        onPanResponderRelease: (_event, gesture) => {
          setTranslateY(0);
          onDragState?.(false);
          onDrop(gesture.dy);
        },
        onPanResponderTerminate: () => {
          setTranslateY(0);
          onDragState?.(false);
        },
      }),
    [disabled, onDrop, onDragState],
  );
  return <Animated.View style={{ transform: [{ translateY }], zIndex: translateY !== 0 ? 99 : 1 }}>{children(responder.panHandlers)}</Animated.View>;
}

/**
 * P4 相簿顯示順序編輯（規格 §2.4）。
 * 固定區 / 一般區內以 ☷ 拖曳調整順序；可固定、可隱藏、可恢復顯示。
 * 每次操作直寫本機資料庫（等同儲存），重開 App 保持相同順序。
 */
export function AlbumOrderEditor({ visible, sourceId, onClose, onChanged }: Props) {
  const { bg, text, muted, border, card } = useTheme();
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const [pinned, setPinnedList] = useState<AlbumEntry[]>([]);
  const [normal, setNormalList] = useState<AlbumEntry[]>([]);
  const [hidden, setHiddenList] = useState<AlbumEntry[]>([]);
  const [working, setWorking] = useState(false);
  const [dragging, setDragging] = useState(false);

  const reload = useCallback(async () => {
    const live = await listTargetAlbums(sourceId);
    const { visible, hidden: hid } = await getAlbumEntries(db, live);
    setPinnedList(visible.filter((e) => e.pinned));
    setNormalList(visible.filter((e) => !e.pinned));
    setHiddenList(hid);
  }, [db, sourceId]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    void (async () => {
      setWorking(true);
      try {
        await reload();
      } finally {
        if (active) setWorking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [reload, visible]);

  const mutate = async (fn: () => Promise<void>) => {
    if (working) return;
    setWorking(true);
    try {
      await fn();
      await reload();
      onChanged();
    } finally {
      setWorking(false);
    }
  };

  const renderRow = (e: AlbumEntry, opts: { group: 'pinned' | 'normal' | 'hidden' }) => {
    const onDrop = (dy: number) => {
      if (opts.group === 'hidden' || Math.abs(dy) < 20) return;
      const amount = Math.max(1, Math.round(Math.abs(dy) / 52));
      const direction = dy < 0 ? -1 : 1;
      void mutate(async () => {
        for (let i = 0; i < amount; i += 1) await moveEntry(db, e.id, direction);
      });
    };
    return (
      <DraggableRow key={e.id} disabled={working || opts.group === 'hidden'} onDrop={onDrop} onDragState={setDragging}>
        {(dragHandlers) => (
          <View style={[styles.row, { borderColor: border }]}>
            {opts.group === 'hidden' ? (
              <>
                <Text style={[styles.rowTitle, { color: muted }]} numberOfLines={1}>
                  {e.title}
                </Text>
                <Pressable
                  disabled={working}
                  onPress={() => void mutate(() => setHidden(db, e.id, false))}
                  hitSlop={8}
                  accessibilityLabel="取消隱藏"
                  style={styles.iconBtn}>
                  <EyeOffIcon size={20} color={muted} />
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.dragHandleWrap} collapsable={false} {...dragHandlers}>
                  <Text style={[styles.dragHandle, { color: muted }]}>☷</Text>
                </View>
                <Text style={[styles.rowTitle, { color: text }]} numberOfLines={1}>
                  {e.title}
                </Text>
                <View style={styles.actions}>
                  <Pressable
                    disabled={working}
                    onPress={() => void mutate(() => setPinned(db, e.id, opts.group !== 'pinned'))}
                    hitSlop={8}
                    accessibilityLabel={opts.group === 'pinned' ? '取消固定' : '固定'}
                    style={styles.iconBtn}>
                    <PinIcon size={19} color={opts.group === 'pinned' ? text : muted} pinned={opts.group === 'pinned'} />
                  </Pressable>
                  <Pressable
                    disabled={working}
                    onPress={() => void mutate(() => setHidden(db, e.id, true))}
                    hitSlop={8}
                    accessibilityLabel="隱藏"
                    style={styles.iconBtn}>
                    <EyeIcon size={19} color={muted} />
                  </Pressable>
                </View>
              </>
            )}
          </View>
        )}
      </DraggableRow>
    );
  };

  const section = (title: string, list: AlbumEntry[], group: 'pinned' | 'normal' | 'hidden') => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: muted }]}>
        {title}（{list.length}）
      </Text>
      {list.length === 0 ? (
        <Text style={[styles.emptyText, { color: muted }]}>無</Text>
      ) : (
        list.map((e) => renderRow(e, { group }))
      )}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: bg,
              borderColor: border,
              // 系統導覽列會蓋住底部按鈕：保底 24px，避免「介面過低、完成被蓋住」
              paddingBottom: Math.max(insets.bottom, 20) + 12,
            },
          ]}
          onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={[styles.title, { color: text }]}>編輯相簿顯示順序</Text>
          <Text style={[styles.sub, { color: muted }]}>只影響本 App 底部的顯示，不修改系統相簿 · 按住 ☷ 拖曳調整順序 · 第 1 個上滑，第 2～5 個下滑快捷</Text>
          <ScrollView
            style={[styles.list, { backgroundColor: card }]}
            scrollEnabled={!dragging}
            showsVerticalScrollIndicator>
            {section('已固定（排最前）', pinned, 'pinned')}
            {section('一般', normal, 'normal')}
            {section('已隱藏', hidden, 'hidden')}
          </ScrollView>
          <Pressable style={[styles.doneBtn, { backgroundColor: text }]} onPress={onClose}>
            <Text style={{ color: bg, fontWeight: '700' }}>完成</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    height: '88%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    padding: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#A8A29E',
    marginBottom: 10,
  },
  title: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2, marginBottom: 10 },
  list: { borderRadius: 10, padding: 10, flex: 1 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 12, marginBottom: 6 },
  emptyText: { fontSize: 13, paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingVertical: 8,
    gap: 8,
  },
  dragHandleWrap: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginLeft: -4,
  },
  dragHandle: { fontSize: 22, width: 26, textAlign: 'center' },
  rowTitle: { flex: 1, flexShrink: 1, minWidth: 0, fontSize: 14, fontWeight: '600' },
  actions: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 4 },
  iconBtn: {
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 12, minHeight: 50 },
});
