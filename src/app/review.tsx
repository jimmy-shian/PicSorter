import { useCallback, useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { useSession } from '@/lib/session-context';
import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/hooks/useTranslation';

const THUMB = 56;

/**
 * 第二階段總覽（規格 §3.1）：只顯示本次有新增的相簿，待刪除獨立放最後。
 * 每個相簿：名稱、本次張數、最多三張縮圖、進入檢查。
 */
export default function ReviewScreen() {
  const { bg, text, muted, border, card, danger } = useTheme();
  const { t } = useTranslation();
  const session = useSession();

  // 進入頁面時補齊缺漏的 uri
  useEffect(() => {
    void session.backfillMissingUris();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 每次獲得焦點時（例如從 review-detail 或 apply 返回）重新同步 DB 決定狀態
  useFocusEffect(
    useCallback(() => {
      void session.reloadDecisions();
    }, [session]),
  );

  const decisionsList = useMemo(() => [...session.decisions.values()], [session.decisions]);
  const trashPending = useMemo(() => decisionsList.filter((d) => d.action === 'trash' && !d.applied).length, [decisionsList]);
  const trashApplied = useMemo(() => decisionsList.filter((d) => d.action === 'trash' && d.applied).length, [decisionsList]);
  const albumPending = useMemo(() => decisionsList.filter((d) => d.action === 'album' && !d.applied).length, [decisionsList]);
  const albumApplied = useMemo(() => decisionsList.filter((d) => d.action === 'album' && d.applied).length, [decisionsList]);
  const skipCount = useMemo(() => decisionsList.filter((d) => d.action === 'skip').length, [decisionsList]);
  const totalPending = trashPending + albumPending;

  const perAlbum = useMemo(() => {
    const map = new Map<string, { title: string; count: number; pendingCount: number; thumbs: string[] }>();
    for (const d of session.decisions.values()) {
      if (d.action !== 'album' || !d.targetAlbumId || !d.uri) continue;
      const prev = map.get(d.targetAlbumId) ?? {
        title: d.targetAlbumTitle ?? d.targetAlbumId,
        count: 0,
        pendingCount: 0,
        thumbs: [],
      };
      prev.count += 1;
      if (!d.applied) prev.pendingCount += 1;
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

  const isFinished = totalPending === 0 && session.processedCount > 0;
  const isEmpty = session.processedCount === 0;

  /** 已全部套用後開新工作：下次進檢查頁就是空的，不會殘留已刪除縮圖 */
  const handleStartFresh = useCallback(async () => {
    await session.restartFresh();
    router.replace('/');
  }, [session]);

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.root, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: text }]}>{t('review.title')}</Text>
        <Text style={[styles.sub, { color: muted }]}>
          {t('review.summaryLine', { classified: albumPending + albumApplied, pending: trashPending, deleted: trashApplied, skipped: skipCount })}
        </Text>
        {session.processedCount === 0 ? (
          <Text style={[styles.empty, { color: muted }]}>{t('review.emptyHint')}</Text>
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
              <Text style={[styles.count, { color: muted }]}>
                {t('review.albumCountLine', { count: a.count, applied: a.count - a.pendingCount })}
              </Text>
              {renderThumbs(a.thumbs)}
            </View>
            <Text style={[styles.enter, { color: muted }]}>{t('review.inspectButton')}</Text>
          </Pressable>
        ))}

        {trashPending > 0 || trashApplied > 0 ? (
          <Pressable
            style={[styles.row, styles.trashRow, { borderColor: trashPending > 0 ? danger : border }]}
            onPress={() => router.push({ pathname: '/review-detail', params: { mode: 'trash' } })}>
            <View style={styles.rowText}>
              <Text style={[styles.albumName, { color: trashPending > 0 ? danger : text }]}>
                {trashPending > 0 ? t('review.statusPendingTrash') : t('review.statusAppliedTrash')}
              </Text>
              <Text style={[styles.count, { color: muted }]}>
                {trashPending > 0
                  ? t('review.pendingTrashLine', { count: trashPending })
                  : t('review.appliedTrashLine', { count: trashApplied })}
              </Text>
              {renderThumbs(trashThumbs)}
            </View>
            <Text style={[styles.enter, { color: muted }]}>{t('review.inspectButton')}</Text>
          </Pressable>
        ) : null}

        <Text style={[styles.note, { color: muted }]}>
          {totalPending === 0 && session.processedCount > 0
            ? [
                albumApplied + trashApplied > 0 ? t('review.summaryApplied') : '',
                skipCount > 0 ? t('review.summarySkipped', { count: skipCount }) : '',
              ].filter(Boolean).join(' ')
            : t('review.summaryDryRun')}
        </Text>

        <Pressable style={[styles.applyBtn, { backgroundColor: text }]} onPress={() => router.back()}>
          <Text style={[styles.applyText, { color: bg }]}>{t('review.backToSorting')}</Text>
        </Pressable>
        {isFinished ? (
          <Pressable style={[styles.applyBtn, { backgroundColor: text }]} onPress={() => void handleStartFresh()}>
            <Text style={[styles.applyText, { color: bg }]}>{t('review.startNew')}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[
              styles.applyBtn,
              totalPending === 0 || isEmpty ? styles.disabledBtn : { backgroundColor: text },
            ]}
            disabled={totalPending === 0 || isEmpty}
            onPress={() => router.push('/apply')}>
            <Text style={[styles.applyText, { color: totalPending === 0 ? muted : bg }]}>{t('navigation.apply')}</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16, gap: 10, paddingBottom: 32 },
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
