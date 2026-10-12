import { useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useSession } from '@/lib/session-context';
import { useTheme } from '@/lib/theme';
import { TargetAlbumSheet } from '@/components/TargetAlbumSheet';

const { width: SCREEN_W } = Dimensions.get('window');
const GAP = 8;
const PAD = 16;
const CELL = (SCREEN_W - PAD * 2 - GAP * 2) / 3;

interface GridItem {
  assetId: string;
  uri: string;
}

/**
 * 相簿 / 待刪除內容檢查（規格 §3.2、§3.3）。
 * 三欄網格 + 放大單張 + 多選修正，全部只改待執行紀錄。
 */
export default function ReviewDetailScreen() {
  const { bg, text, muted, border, card, danger } = useTheme();
  const session = useSession();
  const params = useLocalSearchParams<{ mode?: string; albumId?: string; title?: string }>();
  const isTrash = params.mode === 'trash';
  const albumId = typeof params.albumId === 'string' ? params.albumId : '';
  const title = typeof params.title === 'string' && params.title ? params.title : isTrash ? '待刪除' : '相簿';

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zoomUri, setZoomUri] = useState<string | null>(null);
  const [zoomId, setZoomId] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const items = useMemo<GridItem[]>(() => {
    const out: GridItem[] = [];
    for (const d of session.decisions.values()) {
      if (!d.uri) continue;
      if (isTrash) {
        if (d.action !== 'trash') continue;
      } else if (!(d.action === 'album' && d.targetAlbumId === albumId)) {
        continue;
      }
      out.push({ assetId: d.assetId, uri: d.uri });
    }
    return out;
  }, [session.decisions, isTrash, albumId]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(items.map((i) => i.assetId)));
  const clearAll = () => setSelected(new Set());

  const run = async (fn: (ids: string[]) => Promise<void>) => {
    if (busy) return;
    // 已套用不可再改：只對未套用子集操作，全已套用則提示而不執行
    const pendingIds = ids.filter((id) => !session.decisions.get(id)?.applied);
    if (pendingIds.length === 0) {
      Alert.alert('已套用，不可再修改', '這些照片已寫入系統，如需調整請到系統相簿操作。');
      return;
    }
    setBusy(true);
    try {
      await fn(pendingIds);
      clearAll();
    } finally {
      setBusy(false);
    }
  };

  const ids = useMemo(() => [...selected], [selected]);

  const openZoom = (item: GridItem) => {
    setZoomId(item.assetId);
    setZoomUri(item.uri);
  };
  const closeZoom = () => {
    setZoomId(null);
    setZoomUri(null);
  };

  const renderCell = ({ item }: { item: GridItem }) => {
    const checked = selected.has(item.assetId);
    return (
      <View style={styles.cell}>
        <Pressable onPress={() => openZoom(item)}>
          <Image source={{ uri: item.uri }} style={styles.thumb} contentFit="cover" />
        </Pressable>
        <Pressable
          style={[styles.badge, { borderColor: bg, backgroundColor: checked ? text : 'rgba(0,0,0,0.35)' }]}
          onPress={() => toggle(item.assetId)}>
          {checked ? <Text style={[styles.badgeText, { color: bg }]}>✓</Text> : null}
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bg }]}>
      <View style={[styles.header, { borderColor: border }]}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: muted }]}>‹ 返回</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: isTrash ? danger : text }]} numberOfLines={1}>
          {title} · {items.length} 張
        </Text>
        <Pressable onPress={() => (selected.size === items.length && items.length > 0 ? clearAll() : selectAll())}>
          <Text style={[styles.back, { color: muted }]}>{selected.size > 0 ? `已選 ${selected.size}` : '全選'}</Text>
        </Pressable>
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: muted }}>此處已無本次照片（可能都已移走）。</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.assetId}
          numColumns={3}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          extraData={selected}
          renderItem={renderCell}
        />
      )}

      {selected.size > 0 ? (
        <View style={[styles.actionBar, { borderColor: border, backgroundColor: card }]}>
          {isTrash ? (
            <>
              <Pressable style={[styles.actionBtn, { backgroundColor: text }]} onPress={() => setSheetVisible(true)}>
                <Text style={[styles.actionText, { color: bg }]}>加入分類相簿</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={() => void run((pids) => session.removeDecisions(pids))}>
                <Text style={[styles.actionText, { color: muted }]}>取消刪除</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable style={[styles.actionBtn, { backgroundColor: text }]} onPress={() => setSheetVisible(true)}>
                <Text style={[styles.actionText, { color: bg }]}>改放其他相簿</Text>
              </Pressable>
              <Pressable
                style={styles.actionBtn}
                onPress={() => void run((pids) => session.updateDecisions(pids, { action: 'trash' }))}>
                <Text style={[styles.actionText, { color: danger }]}>改為待刪除</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={() => void run((pids) => session.removeDecisions(pids))}>
                <Text style={[styles.actionText, { color: muted }]}>移除本次分類</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}

      <TargetAlbumSheet
        visible={sheetVisible}
        title={isTrash ? '加入至哪個相簿' : '改放至哪個相簿'}
        targets={session.targets}
        onPick={(targetId) => void run((pids) => session.updateDecisions(pids, { action: 'album', targetAlbumId: targetId }))}
        onClose={() => setSheetVisible(false)}
      />

      <Modal visible={zoomUri !== null} animationType="fade" onRequestClose={closeZoom}>
        <View style={styles.zoomBg}>
          <Pressable style={styles.zoomClose} onPress={closeZoom}>
            <Text style={styles.zoomCloseText}>✕ 關閉</Text>
          </Pressable>
          {zoomUri ? (
            <Image source={{ uri: zoomUri }} style={{ width: SCREEN_W, height: SCREEN_W * 1.2 }} contentFit="contain" />
          ) : null}
          {zoomId ? (
            <Pressable
              style={[styles.zoomSelect, { borderColor: '#fff' }]}
              onPress={() => {
                toggle(zoomId);
                closeZoom();
              }}>
              <Text style={styles.zoomCloseText}>{selected.has(zoomId) ? '取消選擇' : '選擇此張'}</Text>
            </Pressable>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  back: { fontSize: 14, minWidth: 64 },
  headerTitle: { fontSize: 15, fontWeight: '700', flex: 1, textAlign: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  grid: { padding: PAD, gap: GAP },
  row: { gap: GAP, marginBottom: GAP },
  cell: { width: CELL, height: CELL },
  thumb: { width: CELL, height: CELL, borderRadius: 6, backgroundColor: '#E7E5E4' },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 13, fontWeight: '800', lineHeight: 16 },
  actionBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    justifyContent: 'space-around',
  },
  actionBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11 },
  actionText: { fontSize: 13, fontWeight: '700' },
  zoomBg: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  zoomClose: { position: 'absolute', top: 48, right: 20, zIndex: 1, padding: 10 },
  zoomCloseText: { color: '#fff', fontSize: 15 },
  zoomSelect: {
    position: 'absolute',
    bottom: 60,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
});
