import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
import { useSession } from '@/lib/session-context';
import { useTheme } from '@/lib/theme';
import { getApplySummary, type ApplyProgress, type ApplySummary } from '@/lib/apply';
import { isSystemTrashAvailable } from '../../modules/pic-sorter-trash';

type Stage = 'confirm' | 'running' | 'done';

function trashDestinationCopy(): string {
  if (Platform.OS === 'ios') return '系統「最近刪除」（30 天內可復原）';
  if (isSystemTrashAvailable()) return '系統垃圾桶';
  return '永久刪除（此系統沒有垃圾桶，無法復原）';
}

function trashDoneCopy(): string {
  if (Platform.OS === 'ios') return '已移入最近刪除';
  if (isSystemTrashAvailable()) return '已移入垃圾桶';
  return '已永久刪除';
}

/**
 * 最終確認與套用（規格 §3.4、§3.5）。
 * 確認摘要 → 執行進度 → 結果（已分類/已移入垃圾桶/未完成＋重試）。
 * 取消一律記未完成；全部完成才結案。
 */
export default function ApplyScreen() {
  const { bg, text, muted, border, card, danger } = useTheme();
  const session = useSession();
  const db = useSQLiteContext();
  const [stage, setStage] = useState<Stage>('confirm');
  const [summary, setSummary] = useState<ApplySummary | null>(null);
  const [progress, setProgress] = useState<ApplyProgress>({ done: 0, total: 0, phase: 'verify', label: null });
  const [result, setResult] = useState<{ appliedAlbum: number; appliedTrash: number; pendingCount: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef(false);

  const sessionId = session.sessionId;

  const refreshSummary = useCallback(async () => {
    if (!sessionId) return;
    setSummary(await getApplySummary(db, sessionId));
  }, [db, sessionId]);

  useEffect(() => {
    void refreshSummary();
  }, [refreshSummary]);

  const requestTrashConfirm = useCallback((): Promise<'trash' | 'permanent' | 'skip'> => {
    const trashCount = summary?.trashPending ?? 0;
    if (Platform.OS === 'ios') {
      return new Promise((resolve) => {
        Alert.alert(
          '確認移入最近刪除？',
          `是否將這 ${trashCount} 張照片移到系統「最近刪除」？30 天內可在系統相簿中復原。`,
          [
            { text: '取消', style: 'cancel', onPress: () => resolve('skip') },
            { text: '確認移入', style: 'default', onPress: () => resolve('trash') },
          ],
        );
      });
    }
    if (isSystemTrashAvailable()) {
      return new Promise((resolve) => {
        Alert.alert(
          '確認移入垃圾桶？',
          `是否將這 ${trashCount} 張照片移到系統垃圾桶？之後可在系統相簿垃圾桶中復原或清空。`,
          [
            { text: '取消', style: 'cancel', onPress: () => resolve('skip') },
            { text: '確認移入垃圾桶', style: 'default', onPress: () => resolve('trash') },
          ],
        );
      });
    }
    // Android 10 以下：無系統垃圾桶，永久刪除＋二次確認
    return new Promise((resolve) => {
      Alert.alert(
        '此系統沒有垃圾桶',
        `確認將這 ${trashCount} 張照片永久刪除嗎？此動作無法復原。`,
        [
          { text: '取消', style: 'cancel', onPress: () => resolve('skip') },
          {
            text: '我了解，繼續',
            style: 'destructive',
            onPress: () =>
              Alert.alert(`再次確認：永久刪除 ${trashCount} 張照片？`, '刪除後無法復原。', [
                { text: '取消', style: 'cancel', onPress: () => resolve('skip') },
                { text: '確認刪除', style: 'destructive', onPress: () => resolve('permanent') },
              ]),
          },
        ],
      );
    });
  }, [summary?.trashPending]);

  const handleStart = useCallback(async () => {
    if (!sessionId || busy) return;
    setBusy(true);
    cancelRef.current = false;
    setStage('running');
    try {
      const r = await session.runApply({
        onProgress: setProgress,
        isCancelled: () => cancelRef.current,
        requestTrashConfirm,
      });
      setResult(r);
      await refreshSummary();
      setStage('done');
    } finally {
      setBusy(false);
    }
  }, [sessionId, busy, session, requestTrashConfirm, refreshSummary]);

  const handleRetry = useCallback(() => {
    setResult(null);
    void handleStart();
  }, [handleStart]);

  if (!sessionId) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: bg }]}>
        <Text style={{ color: muted }}>沒有進行中的整理，請返回分類。</Text>
        <Pressable style={[styles.btn, { borderColor: border }]} onPress={() => router.back()}>
          <Text style={{ color: text }}>返回</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // ── 確認摘要 ──
  if (stage === 'confirm') {
    const s = summary;
    const nothingPending = s !== null && s.pendingCount === 0;
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: bg }]}>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={[styles.title, { color: text }]}>最後確認</Text>
          {!s ? (
            <Text style={{ color: muted }}>讀取中…</Text>
          ) : nothingPending ? (
            <>
              <Text style={[styles.sub, { color: muted }]}>全部已套用，無待辦事項。</Text>
              <Pressable style={[styles.primary, { backgroundColor: text }]} onPress={() => router.replace('/')}>
                <Text style={[styles.primaryText, { color: bg }]}>完成，返回分類</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.sub, { color: muted }]}>以下變更將寫入系統相簿，請檢查：</Text>
              {s.perAlbum.map((a) => (
                <View key={a.albumId} style={[styles.row, { borderColor: border, backgroundColor: card }]}>
                  <Text style={[styles.rowTitle, { color: text }]}>加入「{a.title}」</Text>
                  <Text style={[styles.rowCount, { color: muted }]}>{a.pending} 張</Text>
                </View>
              ))}
              {s.trashPending > 0 ? (
                <View style={[styles.row, { borderColor: danger }]}>
                  <Text style={[styles.rowTitle, { color: danger }]}>移入{trashDestinationCopy()}</Text>
                  <Text style={[styles.rowCount, { color: muted }]}>{s.trashPending} 張</Text>
                </View>
              ) : null}
              {s.appliedAlbum + s.appliedTrash > 0 ? (
                <Text style={[styles.note, { color: muted }]}>
                  已套用：相簿 {s.appliedAlbum} 張 · 刪除 {s.appliedTrash} 張（不會重複執行）
                </Text>
              ) : null}
              <Pressable
                style={[styles.primary, { backgroundColor: text }]}
                onPress={() => void handleStart()}>
                <Text style={[styles.primaryText, { color: bg }]}>開始套用</Text>
              </Pressable>
              <Pressable style={[styles.ghost, { borderColor: border }]} onPress={() => router.back()}>
                <Text style={[styles.primaryText, { color: text }]}>返回檢查</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── 執行進度 ──
  if (stage === 'running') {
    const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
    const phaseText =
      progress.phase === 'verify'
        ? '正在檢查相簿與照片…'
        : progress.phase === 'album'
          ? `正在加入${progress.label ? `「${progress.label}」` : '相簿'}…`
          : '正在處理待刪除照片…';
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: bg }]}>
        <Text style={[styles.title, { color: text }]}>套用中</Text>
        <Text style={[styles.sub, { color: muted }]}>
          {progress.done} / {progress.total}（{pct}%）
        </Text>
        <View style={[styles.barOuter, { borderColor: border }]}>
          <View style={[styles.barInner, { backgroundColor: text, width: `${pct}%` }]} />
        </View>
        <Text style={[styles.sub, { color: muted }]}>{phaseText}</Text>
        <Text style={[styles.note, { color: muted }]}>已完成的不會因取消而回滾；取消後剩餘保持未套用。</Text>
        <Pressable style={[styles.ghost, styles.cancelBtn, { borderColor: border }]} onPress={() => { cancelRef.current = true; }}>
          <Text style={[styles.primaryText, { color: text }]}>取消</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // ── 結果 ──
  const s = summary;
  const pendingLeft = result?.pendingCount ?? s?.pendingCount ?? 0;
  const failed = s?.failedItems ?? [];
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.title, { color: text }]}>{pendingLeft === 0 ? '整理完成' : '套用中斷'}</Text>
        <View style={[styles.row, { borderColor: border, backgroundColor: card }]}>
          <Text style={[styles.rowTitle, { color: text }]}>已分類</Text>
          <Text style={[styles.rowCount, { color: muted }]}>{result?.appliedAlbum ?? 0} 張</Text>
        </View>
        <View style={[styles.row, { borderColor: border, backgroundColor: card }]}>
          <Text style={[styles.rowTitle, { color: text }]}>{trashDoneCopy()}</Text>
          <Text style={[styles.rowCount, { color: muted }]}>{result?.appliedTrash ?? 0} 張</Text>
        </View>
        <View style={[styles.row, { borderColor: pendingLeft > 0 ? danger : border, backgroundColor: card }]}>
          <Text style={[styles.rowTitle, { color: pendingLeft > 0 ? danger : text }]}>未完成</Text>
          <Text style={[styles.rowCount, { color: muted }]}>{pendingLeft} 張</Text>
        </View>

        {failed.length > 0 ? (
          <>
            <Text style={[styles.sub, { color: muted }]}>失敗項目（可重試）：</Text>
            {failed.map((f) => (
              <View key={f.assetId} style={[styles.failRow, { borderColor: border }]}>
                {f.uri ? <Image source={{ uri: f.uri }} style={styles.failThumb} contentFit="cover" /> : null}
                <Text style={[styles.failReason, { color: muted }]} numberOfLines={2}>
                  {f.reason ?? '未知錯誤'}
                </Text>
              </View>
            ))}
          </>
        ) : null}
        {pendingLeft > 0 && failed.length === 0 ? (
          <Text style={[styles.note, { color: muted }]}>有項目尚未確認（例如垃圾桶未確認或已取消），照片都還在。</Text>
        ) : null}

        {pendingLeft > 0 ? (
          <Pressable style={[styles.primary, { backgroundColor: text }]} onPress={handleRetry}>
            <Text style={[styles.primaryText, { color: bg }]}>重試未完成（{pendingLeft}）</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.primary, { backgroundColor: text }]} onPress={() => router.replace('/')}>
            <Text style={[styles.primaryText, { color: bg }]}>完成，返回分類</Text>
          </Pressable>
        )}
        <Pressable style={[styles.ghost, { borderColor: border }]} onPress={() => router.back()}>
          <Text style={[styles.primaryText, { color: text }]}>返回檢查</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '800' },
  sub: { fontSize: 13, marginBottom: 4, textAlign: 'center' },
  note: { fontSize: 12, lineHeight: 18 },
  row: { borderWidth: 1, borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center' },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: '600' },
  rowCount: { fontSize: 13 },
  primary: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryText: { fontSize: 15, fontWeight: '700' },
  ghost: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 2 },
  btn: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  barOuter: { width: '100%', height: 10, borderWidth: 1, borderRadius: 999, overflow: 'hidden' },
  barInner: { height: '100%' },
  cancelBtn: { width: '100%' },
  failRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, padding: 8, gap: 10 },
  failThumb: { width: 48, height: 48, borderRadius: 6, backgroundColor: '#E7E5E4' },
  failReason: { flex: 1, fontSize: 12, lineHeight: 17 },
});
