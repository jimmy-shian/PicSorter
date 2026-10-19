import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Application from 'expo-application';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session-context';
import { GestureAlbumSheet } from '@/components/GestureAlbumSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  abandonSession,
  clearAllRecords,
  getOpenSessions,
  type OpenSessionInfo,
} from '@/lib/db';
import type { GestureAction, GestureDirection, MoveConfirmMode, ThemeMode } from '@/types';

const GESTURE_DIRS: { dir: GestureDirection; label: string; icon: string }[] = [
  { dir: 'up', label: '向上滑動', icon: '↑' },
  { dir: 'down', label: '向下滑動', icon: '↓' },
  { dir: 'left', label: '向左滑動', icon: '←' },
  { dir: 'right', label: '向右滑動', icon: '→' },
];

const GESTURE_ACTIONS: { action: GestureAction; label: string; desc: string }[] = [
  { action: 'album', label: '放入上滑目標相簿', desc: '放入「分類手勢」設定的上滑目標' },
  { action: 'trash', label: '標記為待刪除', desc: '標記移入垃圾桶' },
  { action: 'skip', label: '略過此張', desc: '不作處理，前進下一張' },
  { action: 'inspect', label: '放入下滑目標相簿', desc: '放入「分類手勢」設定的下滑目標' },
  { action: 'none', label: '無動作 (關閉)', desc: '滑動不執行動作，彈回' },
];

function actionLabel(act: GestureAction): string {
  return GESTURE_ACTIONS.find((a) => a.action === act)?.label ?? act;
}

const MODES: { id: ThemeMode; label: string }[] = [
  { id: 'light', label: '淺色' },
  { id: 'dark', label: '深色' },
  { id: 'system', label: '跟隨系統' },
];

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

/** 基礎設定（規格 §4.4）：只保留必要項目 + 整理進度管理 */
export default function SettingsScreen() {
  const { bg, text, muted, border, card, danger, mode, setMode } = useTheme();
  const session = useSession();
  const db = useSQLiteContext();
  const [records, setRecords] = useState<OpenSessionInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<OpenSessionInfo | null>(null);
  const [clearAllVisible, setClearAllVisible] = useState(false);
  const [preferenceError, setPreferenceError] = useState(false);
  const [resumeFailed, setResumeFailed] = useState(false);

  // 手勢方向設定 picker
  const [gestureTargetsVisible, setGestureTargetsVisible] = useState(false);
  const [pickingDir, setPickingDir] = useState<GestureDirection | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRecords(await getOpenSessions(db));
    } catch {
      // 讀取失敗不阻斷設定頁
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const handleResume = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await session.resumeSession(id);
      if (!ok) {
        setResumeFailed(true);
        await refresh();
        return;
      }
      router.back();
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = (info: OpenSessionInfo) => {
    setDiscardTarget(info);
  };

  const confirmDiscard = async () => {
    if (!discardTarget) return;
    const info = discardTarget;
    setDiscardTarget(null);
    setBusy(true);
    try {
      await abandonSession(db, info.id);
      // 捨棄的正是目前工作時，重建一個乾淨工作，避免後續寫入孤兒列
      if (info.id === session.sessionId) await session.restartFresh();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleClearAll = () => {
    setClearAllVisible(true);
  };

  const confirmClearAll = async () => {
    setClearAllVisible(false);
    setBusy(true);
    try {
      await clearAllRecords(db);
      await session.restartFresh();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  /** 選擇手勢動作：若與另一方向衝突則自動互換，none 允許多重 */
  const handlePickAction = async (action: GestureAction) => {
    if (!pickingDir) return;
    const dir = pickingDir;
    setPickingDir(null);

    if (action !== 'none') {
      // 找出已佔用這個 action 的方向
      const conflictDir = (Object.entries(session.gestureSettings) as [GestureDirection, GestureAction][]).find(
        ([d, a]) => d !== dir && a === action,
      );
      if (conflictDir) {
        // 互換：把衝突方向設為當前方向原本的 action
        const oldAction = session.gestureSettings[dir];
        await session.updateGestureSetting(conflictDir[0], oldAction);
      }
    }
    await session.updateGestureSetting(dir, action);
  };

  return (
    // 有原生 header，已處理頂部安全區；這裡只避開左右+底部導覽列（圖1底部被遮住問題）
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.root, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={[styles.label, { color: muted }]}>外觀</Text>
        <View style={[styles.card, { borderColor: border, backgroundColor: card }]}>
          {MODES.map((m) => (
            <Pressable key={m.id} onPress={() => setMode(m.id)} style={styles.row}>
              <Text style={[styles.rowText, { color: text }]}>{m.label}</Text>
              {mode === m.id ? <Text style={{ color: muted }}>✓</Text> : null}
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, { color: muted }]}>照片排序</Text>
        <View style={[styles.card, { borderColor: border, backgroundColor: card }]}>
          <Pressable onPress={() => session.setSortOrder('newest')} style={styles.row}>
            <Text style={[styles.rowText, { color: text }]}>最新至最舊</Text>
            {session.sortOrder === 'newest' ? <Text style={{ color: muted }}>✓</Text> : null}
          </Pressable>
          <Pressable onPress={() => session.setSortOrder('oldest')} style={styles.row}>
            <Text style={[styles.rowText, { color: text }]}>最舊至最新</Text>
            {session.sortOrder === 'oldest' ? <Text style={{ color: muted }}>✓</Text> : null}
          </Pressable>
        </View>

        {/* ── 手勢方向自訂 ── */}
        <Text style={[styles.label, { color: muted }]}>手勢方向設定</Text>
        <View style={[styles.card, { borderColor: border, backgroundColor: card }]}>
          <Pressable accessibilityRole="button" onPress={() => setGestureTargetsVisible(true)} style={styles.row}>
            <Text style={[styles.rowText, { color: text }]}>分類相簿</Text>
            <Text style={{ color: muted }}>›</Text>
          </Pressable>
          {GESTURE_DIRS.map((g) => {
            const currentAction = session.gestureSettings[g.dir];
            return (
              <Pressable key={g.dir} onPress={() => setPickingDir(g.dir)} style={styles.row}>
                <View style={styles.gestureRowLeft}>
                  <Text style={[styles.gestureIcon, { color: muted }]}>{g.icon}</Text>
                  <Text style={[styles.rowText, { color: text }]}>{g.label}</Text>
                </View>
                <Text style={[styles.gestureAction, { color: muted }]}>{actionLabel(currentAction)} ›</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.gestureHint, { color: muted }]}>
          選擇已佔用的動作時會自動與原方向互換
        </Text>

        <Text style={[styles.label, { color: muted }]}>移動確認</Text>
        <View style={[styles.card, { borderColor: border, backgroundColor: card }]}>
          {([
            ['once', '全部一次確認', '同意後一次套用所有相簿移動'],
            ['each', '每個相簿詢問', '每個相簿移動前都確認'],
          ] as [MoveConfirmMode, string, string][]).map(([modeId, label, desc]) => (
            <Pressable key={modeId} onPress={() => void session.updateMoveConfirmMode(modeId)} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowText, { color: text }]}>{label}</Text>
                <Text style={[styles.switchDesc, { color: muted }]}>{desc}</Text>
              </View>
              {session.moveConfirmMode === modeId ? <Text style={{ color: muted }}>✓</Text> : null}
            </Pressable>
          ))}
        </View>


        <Text style={[styles.label, { color: muted }]}>垃圾桶</Text>
        <View style={[styles.card, { borderColor: border, backgroundColor: card }]}>
          <View style={styles.row}>
            <Text style={[styles.rowText, { color: text, flex: 1, paddingRight: 12 }]}>移入垃圾桶時不再詢問</Text>
            <Switch accessibilityLabel="移入垃圾桶時不再詢問" value={!session.confirmBeforeTrash}
              onValueChange={(value) => { void session.updateConfirmBeforeTrash(!value).catch(() => setPreferenceError(true)); }} />
          </View>
        </View>

        {/* ── 操作教學 ── */}
        <Text style={[styles.label, { color: muted }]}>操作教學</Text>
        <View style={[styles.card, { borderColor: border, backgroundColor: card }]}>
          <Pressable
            onPress={() => {
              session.openTutorial();
              router.back();
            }}
            style={styles.row}>
            <Text style={[styles.rowText, { color: text }]}>重看新手教學</Text>
            <Text style={{ color: muted }}>›</Text>
          </Pressable>
        </View>

        <Text style={[styles.label, { color: muted }]}>整理進度管理</Text>
        <View style={[styles.card, { borderColor: border, backgroundColor: card }]}>
          {records.length === 0 ? (
            <Text style={[styles.emptyText, { color: muted }]}>目前沒有未完成的整理</Text>
          ) : (
            records.map((r) => {
              const isCurrent = r.id === session.sessionId;
              return (
                <View key={r.id} style={styles.recordRow}>
                  <View style={styles.recordText}>
                    {/* 時間即標題：單行不換行，（目前）以徽章呈現不擠標題 */}
                    <View style={styles.recordTitleRow}>
                      <Text style={[styles.recordDate, { color: text }]} numberOfLines={1}>
                        {formatDate(r.created_at)}
                      </Text>
                      {isCurrent ? (
                        <View style={[styles.currentBadge, { borderColor: border }]}>
                          <Text style={[styles.currentBadgeText, { color: muted }]}>目前</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.rowText, { color: text }]} numberOfLines={1}>
                      {r.source_album_title}
                    </Text>
                    {/* 原位置改放總張數語意：共幾張＋待刪幾張，單行省略 */}
                    <Text style={[styles.recordSub, { color: muted }]} numberOfLines={1}>
                      共 {r.decision_count} 張 · 待刪 {r.trash_count} 張
                    </Text>
                  </View>
                  <View style={styles.recordActions}>
                    <Pressable
                      onPress={() => void handleResume(r.id)}
                      style={[styles.miniBtn, { borderColor: text, backgroundColor: card }]}>
                      <Text style={[styles.miniBtnText, { color: text }]}>繼續</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleDiscard(r)}
                      style={[styles.miniBtn, { borderColor: border }]}>
                      <Text style={[styles.miniBtnText, { color: muted }]}>捨棄</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>
        <Pressable onPress={handleClearAll} style={styles.clearRow}>
          <Text style={[styles.clearText, { color: danger }]}>清除所有整理紀錄</Text>
        </Pressable>

        <View style={styles.aboutCard}>
          <Text style={[styles.aboutAppName, { color: text }]}>
            揀影 PicSorter
          </Text>
          <Text style={[styles.aboutVersion, { color: muted }]}>
            版本 {Application.nativeApplicationVersion || '1.0.2'}
          </Text>
          <View style={[styles.aboutDivider, { backgroundColor: border }]} />
          <Text style={[styles.aboutPrivacy, { color: muted }]}>
            純本機離線整理，照片不上傳、不佔用額外空間。
          </Text>
          <Text style={[styles.aboutCopyright, { color: muted }]}>
            © 2026 PicSorter. All{'\u00A0'}rights{'\u00A0'}reserved.
          </Text>
        </View>
      </ScrollView>

      {gestureTargetsVisible && <GestureAlbumSheet visible sourceId={session.source.id} anchor="up"
        upId={session.selectedTargetId} downId={session.downTargetId} shortcutIds={session.shortcutIds}
        onClose={() => setGestureTargetsVisible(false)} onSaved={session.refreshTargets} />}
      {/* ── 手勢動作選擇器 Modal ── */}
      <Modal visible={pickingDir !== null} transparent animationType="fade" onRequestClose={() => setPickingDir(null)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setPickingDir(null)}>
          <Pressable style={[styles.pickerCard, { backgroundColor: bg, borderColor: border }]} onPress={() => {}}>
            <Text style={[styles.pickerTitle, { color: text }]}>
              {pickingDir ? GESTURE_DIRS.find((g) => g.dir === pickingDir)?.label : ''} — 選擇動作
            </Text>
            {GESTURE_ACTIONS.map((a) => {
              const isActive = pickingDir ? session.gestureSettings[pickingDir] === a.action : false;
              // 找出哪個方向已經佔用了此 action（排除 none 與自身）
              const occupiedBy =
                a.action !== 'none' && pickingDir
                  ? (Object.entries(session.gestureSettings) as [GestureDirection, GestureAction][]).find(
                      ([d, act]) => d !== pickingDir && act === a.action,
                    )
                  : undefined;
              const occupiedLabel = occupiedBy
                ? GESTURE_DIRS.find((g) => g.dir === occupiedBy[0])?.label
                : undefined;

              return (
                <Pressable
                  key={a.action}
                  onPress={() => void handlePickAction(a.action)}
                  style={[
                    styles.pickerRow,
                    { borderColor: border, backgroundColor: isActive ? card : 'transparent' },
                  ]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowText, { color: text }]}>{a.label}</Text>
                    <Text style={[styles.pickerDesc, { color: muted }]}>
                      {a.desc}
                      {occupiedLabel ? `（將與「${occupiedLabel}」互換）` : ''}
                    </Text>
                  </View>
                  {isActive ? <Text style={{ color: muted, fontSize: 16 }}>✓</Text> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmDialog
        visible={discardTarget !== null}
        title="捨棄這筆進度？"
        message={
          discardTarget
            ? `${discardTarget.source_album_title} · 已分 ${discardTarget.decision_count} 張`
            : undefined
        }
        confirmText="捨棄"
        destructive
        busy={busy}
        onConfirm={() => void confirmDiscard()}
        onCancel={() => setDiscardTarget(null)}
      />
      <ConfirmDialog
        visible={clearAllVisible}
        title="清除所有整理紀錄？"
        message="未套用的分類決定將一併清除（照片本身不受影響）。"
        confirmText="全部清除"
        destructive
        busy={busy}
        onConfirm={() => void confirmClearAll()}
        onCancel={() => setClearAllVisible(false)}
      />
      <ConfirmDialog visible={preferenceError} title="設定未儲存" message="請稍後再試。" confirmText="知道了"
        onConfirm={() => setPreferenceError(false)} onCancel={() => setPreferenceError(false)} />
      <ConfirmDialog
        visible={resumeFailed}
        title="找不到該筆進度"
        message="可能已被清除，請重新整理。"
        confirmText="知道了"
        onConfirm={() => setResumeFailed(false)}
        onCancel={() => setResumeFailed(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16, gap: 8, paddingBottom: 32 },
  label: { fontSize: 12, marginTop: 8 },
  card: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  rowText: { fontSize: 15 },
  emptyText: { fontSize: 13, paddingVertical: 12 },
  gestureRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gestureIcon: { fontSize: 16, width: 20, textAlign: 'center' },
  gestureAction: { fontSize: 13, flexShrink: 0 },
  gestureHint: { fontSize: 11, marginTop: 2, paddingHorizontal: 4 },
  switchDesc: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  recordRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  recordText: { flex: 1, flexShrink: 1, minWidth: 0, gap: 2 },
  recordTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recordDate: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  currentBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, flexShrink: 0 },
  currentBadgeText: { fontSize: 11 },
  recordSub: { fontSize: 12, marginTop: 2 },
  recordActions: { flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: 6, flexShrink: 0 },
  miniBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 54,
  },
  miniBtnText: { fontSize: 12, fontWeight: '700' },
  clearRow: { alignItems: 'center', paddingVertical: 10 },
  clearText: { fontSize: 13 },
  aboutCard: {
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 8,
    paddingHorizontal: 20,
    gap: 4,
  },
  aboutAppName: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  aboutVersion: {
    fontSize: 12,
    fontWeight: '500',
  },
  aboutDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  aboutDivider: {
    width: 36,
    height: 1,
    marginVertical: 8,
  },
  aboutPrivacy: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    maxWidth: '92%',
  },
  aboutCopyright: {
    fontSize: 11,
    marginTop: 4,
    opacity: 0.7,
    textAlign: 'center',
    lineHeight: 16,
  },
  // 手勢動作選擇器
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  pickerCard: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  pickerDesc: {
    fontSize: 12,
    marginTop: 2,
  },
});
