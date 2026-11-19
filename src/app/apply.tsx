import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
import { useSession } from '@/lib/session-context';
import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/hooks/useTranslation';
import i18n from '@/i18n';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { getApplySummary, type ApplyProgress, type ApplySummary } from '@/lib/apply';
import { isSystemTrashAvailable } from '../../modules/pic-sorter-trash';

type Stage = 'confirm' | 'running' | 'done';

function trashDestinationCopy(): string {
  if (Platform.OS === 'ios') return i18n.t('apply.trashLocation.ios');
  if (isSystemTrashAvailable()) return i18n.t('apply.trashLocation.android');
  return i18n.t('apply.trashLocation.none');
}

function trashDoneCopy(): string {
  if (Platform.OS === 'ios') return i18n.t('apply.trashDone.ios');
  if (isSystemTrashAvailable()) return i18n.t('apply.trashDone.android');
  return i18n.t('apply.trashDone.none');
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
  const { t } = useTranslation();
  const [stage, setStage] = useState<Stage>('confirm');
  const [summary, setSummary] = useState<ApplySummary | null>(null);
  const [progress, setProgress] = useState<ApplyProgress>({ done: 0, total: 0, phase: 'verify', label: null });
  const [result, setResult] = useState<{ appliedAlbum: number; appliedTrash: number; pendingCount: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef(false);
  const [dontAsk, setDontAsk] = useState(false);
  const rememberTrash = useRef(false);
  const [preferenceError, setPreferenceError] = useState(false);
  // App 內自訂確認框狀態：取代原生 Alert，樣式跟主題走。
  // 管線跑到垃圾桶階段時 requestTrashConfirm 會顯示此框、等待使用者選擇；
  // 之後 OS 還會有一次系統同意框（批次一次，無法移除，見下方說明）。
  const [trashDialog, setTrashDialog] = useState<null | { step: 'first' | 'second'; count: number }>(null);
  const trashResolver = useRef<((v: 'trash' | 'permanent' | 'skip') => void) | null>(null);

  const sessionId = session.sessionId;

  const refreshSummary = useCallback(async () => {
    if (!sessionId) return;
    setSummary(await getApplySummary(db, sessionId));
  }, [db, sessionId]);

  useEffect(() => {
    let active = true;
    if (!sessionId) return;
    void getApplySummary(db, sessionId).then((res) => {
      if (active) setSummary(res);
    });
    return () => {
      active = false;
    };
  }, [db, sessionId]);

  const requestTrashConfirm = useCallback((count: number): Promise<'trash' | 'permanent' | 'skip'> => {
    if (!session.confirmBeforeTrash && (Platform.OS === 'ios' || isSystemTrashAvailable())) return Promise.resolve('trash');
    setDontAsk(false);
    return new Promise((resolve) => {
      trashResolver.current = resolve;
      setTrashDialog({ step: 'first', count });
    });
  }, [session.confirmBeforeTrash]);

  const resolveTrash = useCallback((v: 'trash' | 'permanent' | 'skip') => {
    setTrashDialog(null);
    trashResolver.current?.(v);
    trashResolver.current = null;
  }, []);

  useEffect(() => () => {
    cancelRef.current = true;
    trashResolver.current?.('skip'); trashResolver.current = null;
  }, []);

  const handleStart = useCallback(async () => {
    if (!sessionId || busy) return;
    setBusy(true);
    rememberTrash.current = false;
    cancelRef.current = false;
    setStage('running');
    try {
      const r = await session.runApply({
        onProgress: setProgress,
        isCancelled: () => cancelRef.current,
        requestTrashConfirm,
      });
      if (r.appliedTrash > 0 && rememberTrash.current) {
        try { await session.updateConfirmBeforeTrash(false); }
        catch { setPreferenceError(true); }
      }
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

  /** 全部套用完成後的「完成」：開一筆乾淨新工作再返回，檢查頁才會是空的 */
  const handleFinishAndFresh = useCallback(async () => {
    try {
      await session.restartFresh();
    } finally {
      if (router.canDismiss()) router.dismissAll();
      else router.replace('/');
    }
  }, [session]);

  if (!sessionId) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.center, { backgroundColor: bg }]}>
        <Text style={{ color: muted }}>{t('apply.noActiveSession')}</Text>
        <Pressable style={[styles.btn, { borderColor: border }]} onPress={() => router.back()}>
          <Text style={{ color: text }}>{t('common.back')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const trashCount = trashDialog?.count ?? summary?.trashPending ?? 0;
  const trashFirstTitle =
    Platform.OS === 'ios'
      ? t('apply.confirmTrashTitle.ios')
      : isSystemTrashAvailable()
        ? t('apply.confirmTrashTitle.android')
        : t('apply.confirmTrashTitle.none');
  const trashFirstMessage =
    Platform.OS === 'ios'
      ? t('apply.confirmTrashMessage.ios', { count: trashCount })
      : isSystemTrashAvailable()
        ? t('apply.confirmTrashMessage.android', { count: trashCount })
        : t('apply.confirmTrashMessage.none', { count: trashCount });

  const trashDialogs = (
    <>
      <ConfirmDialog
        visible={stage === 'running' && trashDialog?.step === 'first'}
        title={trashFirstTitle}
        message={trashFirstMessage}
        confirmText={
          Platform.OS === 'ios'
            ? t('apply.confirmTrashButton.ios')
            : isSystemTrashAvailable()
              ? t('apply.confirmTrashButton.android')
              : t('apply.confirmTrashButton.none')
        }
        destructive={!isSystemTrashAvailable() && Platform.OS !== 'ios'}
        destructiveHint={t('apply.confirmTrashDestructiveHint')}
        onConfirm={() => {
          rememberTrash.current = dontAsk && (Platform.OS === 'ios' || isSystemTrashAvailable());
          resolveTrash(Platform.OS !== 'ios' && !isSystemTrashAvailable() ? 'permanent' : 'trash');
        }}
        onCancel={() => resolveTrash('skip')}>
        {(Platform.OS === 'ios' || isSystemTrashAvailable()) && <Pressable accessibilityRole="checkbox"
          accessibilityLabel={t('apply.confirmTrashDontAsk')} accessibilityState={{ checked: dontAsk }} onPress={() => setDontAsk(!dontAsk)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }}>
          <Text style={{ color: text, fontSize: 22 }}>{dontAsk ? '☑' : '☐'}</Text>
          <Text style={{ color: text, fontSize: 14 }}>{t('apply.confirmTrashDontAsk')}</Text>
        </Pressable>}
      </ConfirmDialog>
    </>
  );

  // ── 確認摘要 ──
  if (stage === 'confirm') {
    const s = summary;
    const nothingPending = s !== null && s.pendingCount === 0;
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.root, { backgroundColor: bg }]}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: text }]}>{t('apply.finalConfirmTitle')}</Text>
          {!s ? (
            <Text style={{ color: muted }}>{t('common.reading')}</Text>
          ) : nothingPending ? (
            <>
              <Text style={[styles.sub, { color: muted }]}>{t('apply.allApplied')}</Text>
              <Pressable style={[styles.primary, { backgroundColor: text }]} onPress={() => void handleFinishAndFresh()}>
                <Text style={[styles.primaryText, { color: bg }]}>{t('apply.doneBackButton')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.sub, { color: muted }]}>{t('apply.reviewHeader')}</Text>
              {s.perAlbum.map((a) => (
                <View key={a.albumId} style={[styles.row, { borderColor: border, backgroundColor: card }]}>
                  <Text style={[styles.rowTitle, { color: text }]}>{t('apply.addToAlbum', { title: a.title })}</Text>
                  <Text style={[styles.rowCount, { color: muted }]}>{t('apply.countPhotos', { count: a.pending })}</Text>
                </View>
              ))}
              {s.trashPending > 0 ? (
                <View style={[styles.row, { borderColor: danger }]}>
                  <Text style={[styles.rowTitle, { color: danger }]}>{t('apply.moveToShort')}{trashDestinationCopy()}</Text>
                  <Text style={[styles.rowCount, { color: muted }]}>{t('apply.countPhotos', { count: s.trashPending })}</Text>
                </View>
              ) : null}
              {s.appliedAlbum + s.appliedTrash > 0 ? (
                <Text style={[styles.note, { color: muted }]}>
                  {t('apply.appliedSummary', { album: s.appliedAlbum, trash: s.appliedTrash })}
                </Text>
              ) : null}
              <Pressable
                style={[styles.primary, { backgroundColor: text }]}
                onPress={() => void handleStart()}>
                <Text style={[styles.primaryText, { color: bg }]}>{t('navigation.apply')}</Text>
              </Pressable>
              <Pressable style={[styles.ghost, { borderColor: border }]} onPress={() => router.back()}>
                <Text style={[styles.primaryText, { color: text }]}>{t('apply.backToReview')}</Text>
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
        ? t('apply.progressVerifying')
        : progress.phase === 'album'
          ? progress.label ? t('apply.progressMovingAlbum', { label: progress.label }) : t('apply.progressMovingAlbumGeneric')
          : Platform.OS === 'ios' ? t('apply.progressMovingTrash.ios') : isSystemTrashAvailable() ? t('apply.progressMovingTrash.android') : t('apply.progressMovingTrash.none');
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.center, { backgroundColor: bg }]}>

        <Text style={{ color: text, fontSize: 40, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{pct}%</Text>
        <View style={[styles.barOuter, { borderColor: border }]}>
          <View style={[styles.barInner, { backgroundColor: text, width: `${pct}%` }]} />
        </View>
        <Text style={[styles.note, { color: muted }]}>{progress.done} / {progress.total}</Text>
        <Text style={[styles.sub, { color: muted }]}>{phaseText}</Text>
        <Text style={[styles.note, { color: muted }]}>{t('apply.cancelNotice')}</Text>
        <Pressable style={[styles.ghost, styles.cancelBtn, { borderColor: border }]} onPress={() => { cancelRef.current = true; }}>
          <Text style={[styles.primaryText, { color: text }]}>{t('common.cancel')}</Text>
        </Pressable>
        {trashDialogs}
      </SafeAreaView>
    );
  }

  // ── 結果 ──
  const s = summary;
  const pendingLeft = result?.pendingCount ?? s?.pendingCount ?? 0;
  const failed = s?.failedItems ?? [];
  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.root, { backgroundColor: bg }]}>
      <ConfirmDialog visible={preferenceError} title={t('apply.errorPrefNotSavedTitle')} message={t('apply.errorPrefNotSavedMessage')} confirmText={t('apply.errorPrefNotSavedConfirm')}
        onConfirm={() => setPreferenceError(false)} onCancel={() => setPreferenceError(false)} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: text }]}>{pendingLeft === 0 ? t('apply.resultComplete') : t('apply.resultInterrupted')}</Text>
        <View style={[styles.row, { borderColor: border, backgroundColor: card }]}>
          <Text style={[styles.rowTitle, { color: text }]}>{t('apply.classified')}</Text>
          <Text style={[styles.rowCount, { color: muted }]}>{t('apply.countPhotos', { count: result?.appliedAlbum ?? 0 })}</Text>
        </View>
        <View style={[styles.row, { borderColor: border, backgroundColor: card }]}>
          <Text style={[styles.rowTitle, { color: text }]}>{trashDoneCopy()}</Text>
          <Text style={[styles.rowCount, { color: muted }]}>{t('apply.countPhotos', { count: result?.appliedTrash ?? 0 })}</Text>
        </View>
        <View style={[styles.row, { borderColor: pendingLeft > 0 ? danger : border, backgroundColor: card }]}>
          <Text style={[styles.rowTitle, { color: pendingLeft > 0 ? danger : text }]}>{t('apply.incomplete')}</Text>
          <Text style={[styles.rowCount, { color: muted }]}>{t('apply.countPhotos', { count: pendingLeft })}</Text>
        </View>

        {failed.length > 0 ? (
          <>
            <Text style={[styles.sub, { color: muted }]}>{t('apply.failedItems')}</Text>
            {failed.map((f) => (
              <View key={f.assetId} style={[styles.failRow, { borderColor: border }]}>
                {f.uri ? <Image source={{ uri: f.uri }} style={styles.failThumb} contentFit="cover" /> : null}
                <Text style={[styles.failReason, { color: muted }]} numberOfLines={2}>
                  {f.reason ?? t('apply.errorUnknown')}
                </Text>
              </View>
            ))}
          </>
        ) : null}
        {pendingLeft > 0 && failed.length === 0 ? (
          <Text style={[styles.note, { color: muted }]}>{t('apply.unconfirmedNotice')}</Text>
        ) : null}

        {pendingLeft > 0 ? (
          <Pressable style={[styles.primary, { backgroundColor: text }]} onPress={handleRetry}>
            <Text style={[styles.primaryText, { color: bg }]}>{t('apply.retryIncomplete', { count: pendingLeft })}</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.primary, { backgroundColor: text }]} onPress={() => void handleFinishAndFresh()}>
            <Text style={[styles.primaryText, { color: bg }]}>{t('apply.doneBackButton')}</Text>
          </Pressable>
        )}
        <Pressable style={[styles.ghost, { borderColor: border }]} onPress={() => router.back()}>
          <Text style={[styles.primaryText, { color: text }]}>{t('apply.backToReview')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16, gap: 10, paddingBottom: 32 },
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
