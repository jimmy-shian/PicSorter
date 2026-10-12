import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useTheme } from '@/lib/theme';
import { createTargetAlbum } from '@/lib/media';
import { AlbumOrderEditor } from '@/components/AlbumOrderEditor';
import type { TargetAlbum } from '@/types';

export interface ChipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AlbumBarHandle {
  /** 量測目前可見相簿 chip 的螢幕座標，供下拖命中判斷 */
  measureChips: () => Promise<Map<string, ChipRect>>;
}

interface Props {
  targets: TargetAlbum[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (t: TargetAlbum) => Promise<void>;
  /** 目前來源相簿 id：編輯器與底部列一致，排除來源本身 */
  sourceId: string | null;
  onOrderChanged: () => void;
  /** 下拖進行中：全部相簿顯示可放入提示 */
  dropMode: boolean;
  /** 手指正下方的相簿：突出顯示 */
  highlightId: string | null;
  expanded: boolean;
  onToggleExpand: () => void;
  /** 版面穩定後（展開/收合/目標變化）通知父層重新量測 */
  onLayoutReady?: () => void;
}

export const AlbumBar = forwardRef<AlbumBarHandle, Props>(function AlbumBar(
  {
    targets,
    selectedId,
    onSelect,
    onAdd,
    sourceId,
    onOrderChanged,
    dropMode,
    highlightId,
    expanded,
    onToggleExpand,
    onLayoutReady,
  },
  ref,
) {
  const { text, muted, border, card, bg } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const chipRefs = useRef(new Map<string, View | null>());

  useImperativeHandle(
    ref,
    () => ({
      measureChips: () => {
        const jobs = targets.map(
          (t) =>
            new Promise<[string, ChipRect | null]>((resolve) => {
              const view = chipRefs.current.get(t.id);
              if (!view) {
                resolve([t.id, null]);
                return;
              }
              try {
                view.measureInWindow((x, y, width, height) => {
                  if (width <= 0 || height <= 0) resolve([t.id, null]);
                  else resolve([t.id, { x, y, width, height }]);
                });
              } catch {
                resolve([t.id, null]);
              }
            }),
        );
        return Promise.all(jobs).then((entries) => {
          const map = new Map<string, ChipRect>();
          for (const [id, rect] of entries) {
            if (rect) map.set(id, rect);
          }
          return map;
        });
      },
    }),
    [targets],
  );

  const handleCreate = async () => {
    const title = name.trim();
    if (!title) {
      Alert.alert('請輸入相簿名稱');
      return;
    }
    setBusy(true);
    try {
      const album = await createTargetAlbum(title);
      await onAdd(album);
      setName('');
      setModalVisible(false);
    } catch {
      Alert.alert('建立失敗', '無法建立相簿，請稍後再試。');
    } finally {
      setBusy(false);
    }
  };

  const handleContainerLayout = (_e: LayoutChangeEvent) => {
    if (dropMode) onLayoutReady?.();
  };

  const renderChip = (t: TargetAlbum) => {
    const active = t.id === selectedId;
    const highlighted = dropMode && t.id === highlightId;
    return (
      <Pressable
        key={t.id}
        ref={(el) => {
          if (el) chipRefs.current.set(t.id, el);
          else chipRefs.current.delete(t.id);
        }}
        onPress={() => onSelect(t.id)}
        style={[
          styles.chip,
          {
            borderColor: highlighted ? text : active ? text : dropMode ? text : border,
            borderStyle: dropMode && !highlighted ? 'dashed' : 'solid',
            backgroundColor: highlighted ? text : active ? card : 'transparent',
          },
        ]}>
        <Text
          style={[
            styles.chipText,
            { color: highlighted ? bg : text, fontWeight: active || highlighted ? '700' : '400' },
          ]}>
          {t.title}
        </Text>
      </Pressable>
    );
  };

  return (
    <View onLayout={handleContainerLayout}>
      {expanded ? (
        <ScrollView style={styles.gridScroll} contentContainerStyle={styles.grid} scrollEnabled={!dropMode}>
          {targets.map(renderChip)}
          <Pressable style={[styles.chip, { borderColor: border }]} onPress={() => setModalVisible(true)}>
            <Text style={[styles.chipText, { color: muted }]}>＋ 新增</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          scrollEnabled={!dropMode}>
          {targets.map(renderChip)}
          <Pressable style={[styles.chip, { borderColor: border }]} onPress={() => setModalVisible(true)}>
            <Text style={[styles.chipText, { color: muted }]}>＋</Text>
          </Pressable>
        </ScrollView>
      )}
      <View style={styles.editRow}>
        <Pressable onPress={onToggleExpand}>
          <Text style={[styles.editText, { color: muted }]}>{expanded ? '收合 ▲' : '展開全部 ▼'}</Text>
        </Pressable>
        <Text style={[styles.editDot, { color: muted }]}> · </Text>
        <Pressable onPress={() => setEditorVisible(true)}>
          <Text style={[styles.editText, { color: muted }]}>編輯顯示順序</Text>
        </Pressable>
      </View>

      <AlbumOrderEditor
        visible={editorVisible}
        sourceId={sourceId}
        onClose={() => setEditorVisible(false)}
        onChanged={onOrderChanged}
      />

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: bg, borderColor: border }]}>
            <Text style={[styles.modalTitle, { color: text }]}>新增分類相簿</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="例如：旅遊"
              placeholderTextColor={muted}
              style={[styles.input, { color: text, borderColor: border }]}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <Pressable onPress={() => setModalVisible(false)} style={styles.modalBtn}>
                <Text style={{ color: muted }}>取消</Text>
              </Pressable>
              <Pressable onPress={handleCreate} disabled={busy} style={styles.modalBtn}>
                <Text style={{ color: text, fontWeight: '700' }}>{busy ? '建立中…' : '建立'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  gridScroll: { maxHeight: 132 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 4,
  },
  chipText: { fontSize: 14 },
  editRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingBottom: 6 },
  editText: { fontSize: 11 },
  editDot: { fontSize: 11 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { borderWidth: 1, borderRadius: 12, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 16 },
  modalBtn: { padding: 8 },
});
