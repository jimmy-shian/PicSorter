import { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useSession } from '@/lib/session-context';
import { useTheme } from '@/lib/theme';

const THUMB = 56;

/**
 * 第二階段總覽（規格 §3.1）：只顯示本次有新增的相簿，待刪除獨立放最後。
 * 每個相簿：名稱、本次張數、最多三張縮圖、進入檢查。
 */
export default function ReviewScreen() {
  const { bg, text, muted, border, card, danger } = useTheme();
  const session = useSession();

  // v1 舊決定列沒有 uri：進入時補齊（系統中已消失的順手清除）
  useEffect(() => {
    void session.backfillMissingUris();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const perAlbum = useMemo(() => {
    const map = new Map<string, { title: string; count: number; thumbs: string[] }>();
    for (const d of session.decisions.values()) {
      if (d.action !== 'album' || !d.targetAlbumId || !d.uri) continue;
      const prev = map.get(d.targetAlbumId) ?? { title: d.targetAlbumTitle ?? d.targetAlbumId, count: 0, thumbs: [] };
      prev.count += 1;
      if (prev.thumbs.length < 3) prev.thumbs.push(d.uri);
      map.set(d.targetAlbumId, prev);
    }
    return [...map.entries()].map(([albumId, v]) => ({ albumId, ...v }));
  }, [session.decisions]);

  const trashThumbs = useMemo(() => {
    const out: string[] = [];
    for (const d of session.decisions.values()) {
      if (d.action === 'trash' && d.uri && out.length < 3) out.push(d.uri);
    }
    return out;
  }, [session.decisions]);

  const renderThumbs = (thumbs: string[]) => (
    <View style={styles.thumbs}>
      {thumbs.map((uri) => (
        <Image key={uri} source={{ uri }} style={styles.thumb} contentFit="cover" />
      ))}
    </View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.title, { color: text }]}>本次整理結果</Text>
        <Text style={[styles.sub, { color: muted }]}>
          已分類 {session.processedCount} 張 · 待刪除 {session.trashCount} 張
        </Text>
        {session.processedCount === 0 ? (
          <Text style={[styles.empty, { color: muted }]}>尚無分類紀錄，請返回分類至少一張照片。</Text>
        ) : null}

        {perAlbum.map((a) => (
          <Pressable
            key={a.albumId}
            style={[styles.row, { borderColor: border, backgroundColor: card }]}
            onPress={() =>
              router.push({ pathname: '/review-detail', params: { mode: 'album', albumId: a.albumId, title: a.title } })
            }>
            <View style={styles.rowText}>
              <Text style={[styles.albumName, { color: text }]}>{a.title}</Text>
              <Text style={[styles.count, { color: muted }]}>{a.count} 張</Text>
              {renderThumbs(a.thumbs)}
            </View>
            <Text style={[styles.enter, { color: muted }]}>檢查 ›</Text>
          </Pressable>
        ))}

        {session.trashCount > 0 ? (
          <Pressable
            style={[styles.row, styles.trashRow, { borderColor: danger }]}
            onPress={() => router.push({ pathname: '/review-detail', params: { mode: 'trash' } })}>
            <View style={styles.rowText}>
              <Text style={[styles.albumName, { color: danger }]}>待刪除</Text>
              <Text style={[styles.count, { color: muted }]}>{session.trashCount} 張 · 尚未真正刪除</Text>
              {renderThumbs(trashThumbs)}
            </View>
            <Text style={[styles.enter, { color: muted }]}>檢查 ›</Text>
          </Pressable>
        ) : null}

        <Text style={[styles.note, { color: muted }]}>
          此階段所有修正只更新待執行紀錄，不會立即修改系統相簿或刪除照片（規格 §3.2–3.4）。
        </Text>

        <Pressable style={[styles.applyBtn, { backgroundColor: text }]} onPress={() => router.back()}>
          <Text style={[styles.applyText, { color: bg }]}>返回繼續分類</Text>
        </Pressable>
        <Pressable
          style={[styles.applyBtn, session.processedCount === 0 ? styles.disabledBtn : { backgroundColor: text }]}
          disabled={session.processedCount === 0}
          onPress={() => router.push('/apply')}>
          <Text style={[styles.applyText, { color: bg }]}>確認並套用</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16, gap: 10 },
  title: { fontSize: 20, fontWeight: '800' },
  sub: { fontSize: 13, marginBottom: 8 },
  empty: { fontSize: 13, marginVertical: 12 },
  row: { borderWidth: 1, borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center' },
  trashRow: { borderWidth: 1.5 },
  rowText: { flex: 1 },
  albumName: { fontSize: 16, fontWeight: '700' },
  count: { fontSize: 13, marginTop: 2 },
  thumbs: { flexDirection: 'row', gap: 6, marginTop: 8 },
  thumb: { width: THUMB, height: THUMB, borderRadius: 6, backgroundColor: '#E7E5E4' },
  enter: { fontSize: 13, marginLeft: 8 },
  note: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  applyBtn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  disabledBtn: { backgroundColor: '#D6D3D1' },
  ghostBtn: { borderWidth: 1.5, backgroundColor: 'transparent' },
  applyText: { fontSize: 15, fontWeight: '700' },
});
