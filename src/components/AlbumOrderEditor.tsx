import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useTheme } from '@/lib/theme';
import { listTargetAlbums } from '@/lib/media';
import {
  getAlbumEntries,
  moveEntry,
  setHidden,
  setPinned,
  type AlbumEntry,
} from '@/lib/album-order';

interface Props {
  visible: boolean;
  /** 目前來源相簿 id：與底部列一致，排除來源本身作為目標 */
  sourceId: string | null;
  onClose: () => void;
  /** 任一變更後通知父層重載底部列 */
  onChanged: () => void;
}

/**
 * P4 相簿顯示順序編輯（規格 §2.4）。
 * 固定區 / 一般區內以 ↑↓ 調整順序；可固定、可隱藏、可恢復顯示。
 * 每次操作直寫本機資料庫（等同儲存），重開 App 保持相同順序。
 */
export function AlbumOrderEditor({ visible, sourceId, onClose, onChanged }: Props) {
  const { bg, text, muted, border, card } = useTheme();
  const db = useSQLiteContext();
  const [pinned, setPinnedList] = useState<AlbumEntry[]>([]);
  const [normal, setNormalList] = useState<AlbumEntry[]>([]);
  const [hidden, setHiddenList] = useState<AlbumEntry[]>([]);
  const [working, setWorking] = useState(false);

  const reload = useCallback(async () => {
    const live = await listTargetAlbums(sourceId);
    const { visible, hidden: hid } = await getAlbumEntries(db, live);
    setPinnedList(visible.filter((e) => e.pinned));
    setNormalList(visible.filter((e) => !e.pinned));
    setHiddenList(hid);
  }, [db, sourceId]);

  useEffect(() => {
    if (!visible) return;
    setWorking(true);
    reload().finally(() => setWorking(false));
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

  const renderRow = (e: AlbumEntry, opts: { up: boolean; down: boolean; group: 'pinned' | 'normal' | 'hidden' }) => (
    <View key={e.id} style={[styles.row, { borderColor: border }]}>
      {opts.group === 'hidden' ? (
        <Text style={[styles.rowTitle, { color: muted }]} numberOfLines={1}>
          {e.title}
        </Text>
      ) : (
        <>
          <View style={styles.arrows}>
            <Pressable disabled={!opts.up || working} onPress={() => void mutate(() => moveEntry(db, e.id, -1))}>
              <Text style={[styles.arrow, { color: opts.up ? text : border }]}>↑</Text>
            </Pressable>
            <Pressable disabled={!opts.down || working} onPress={() => void mutate(() => moveEntry(db, e.id, 1))}>
              <Text style={[styles.arrow, { color: opts.down ? text : border }]}>↓</Text>
            </Pressable>
          </View>
          <Text style={[styles.rowTitle, { color: text }]} numberOfLines={1}>
            {e.title}
          </Text>
          <Pressable disabled={working} onPress={() => void mutate(() => setPinned(db, e.id, opts.group !== 'pinned'))}>
            <Text style={[styles.miniBtn, { color: muted }]}>
              {opts.group === 'pinned' ? '取消固定' : '固定'}
            </Text>
          </Pressable>
          <Pressable disabled={working} onPress={() => void mutate(() => setHidden(db, e.id, true))}>
            <Text style={[styles.miniBtn, { color: muted }]}>隱藏</Text>
          </Pressable>
        </>
      )}
      {opts.group === 'hidden' ? (
        <Pressable disabled={working} onPress={() => void mutate(() => setHidden(db, e.id, false))}>
          <Text style={[styles.miniBtn, { color: text }]}>顯示</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const section = (title: string, list: AlbumEntry[], group: 'pinned' | 'normal' | 'hidden') => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: muted }]}>
        {title}（{list.length}）
      </Text>
      {list.length === 0 ? (
        <Text style={[styles.emptyText, { color: muted }]}>無</Text>
      ) : (
        list.map((e, i) =>
          renderRow(e, { up: i > 0, down: i < list.length - 1, group }),
        )
      )}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: bg, borderColor: border }]} onPress={() => {}}>
          <Text style={[styles.title, { color: text }]}>編輯相簿顯示順序</Text>
          <Text style={[styles.sub, { color: muted }]}>只影響本 App 底部的顯示，不修改系統相簿</Text>
          <ScrollView style={[styles.list, { backgroundColor: card }]}>
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
    maxHeight: '80%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    padding: 16,
  },
  title: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2, marginBottom: 10 },
  list: { borderRadius: 10, padding: 10, maxHeight: 420 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 12, marginBottom: 6 },
  emptyText: { fontSize: 13, paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingVertical: 8,
    gap: 10,
  },
  arrows: { flexDirection: 'row', gap: 12 },
  arrow: { fontSize: 17, fontWeight: '700', paddingHorizontal: 4 },
  rowTitle: { flex: 1, fontSize: 14 },
  miniBtn: { fontSize: 12, paddingHorizontal: 4, paddingVertical: 6 },
  doneBtn: { borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
});
