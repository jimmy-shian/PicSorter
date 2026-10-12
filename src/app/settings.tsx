import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Application from 'expo-application';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session-context';
import {
  abandonSession,
  clearAllRecords,
  getOpenSessions,
  type OpenSessionInfo,
} from '@/lib/db';
import type { ThemeMode } from '@/types';

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
        Alert.alert('找不到該筆進度', '可能已被清除，請重新整理。');
        await refresh();
        return;
      }
      router.back();
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = (info: OpenSessionInfo) => {
    Alert.alert('捨棄這筆進度？', `${info.source_album_title} · 已分 ${info.decision_count} 張`, [
      { text: '取消', style: 'cancel' },
      {
        text: '捨棄',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            await abandonSession(db, info.id);
            // 捨棄的正是目前工作時，重建一個乾淨工作，避免後續寫入孤兒列
            if (info.id === session.sessionId) await session.restartFresh();
            await refresh();
          })(),
      },
    ]);
  };

  const handleClearAll = () => {
    Alert.alert('清除所有整理紀錄？', '未套用的分類決定將一併清除（照片本身不受影響）。', [
      { text: '取消', style: 'cancel' },
      {
        text: '全部清除',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            await clearAllRecords(db);
            await session.restartFresh();
            await refresh();
          })(),
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bg }]}>
      <View style={styles.body}>
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

        <Text style={[styles.label, { color: muted }]}>整理進度管理</Text>
        <View style={[styles.card, { borderColor: border, backgroundColor: card }]}>
          {records.length === 0 ? (
            <Text style={[styles.emptyText, { color: muted }]}>目前沒有未完成的整理</Text>
          ) : (
            records.map((r) => (
              <View key={r.id} style={styles.recordRow}>
                <View style={styles.recordText}>
                  <Text style={[styles.rowText, { color: text }]}>
                    {r.source_album_title}
                    {r.id === session.sessionId ? '（目前）' : ''}
                  </Text>
                  <Text style={[styles.recordSub, { color: muted }]}>
                    {formatDate(r.created_at)} · 已分 {r.decision_count} · 待刪 {r.trash_count}
                  </Text>
                </View>
                <Pressable onPress={() => void handleResume(r.id)} style={styles.miniBtn}>
                  <Text style={[styles.miniBtnText, { color: text }]}>繼續</Text>
                </Pressable>
                <Pressable onPress={() => handleDiscard(r)} style={styles.miniBtn}>
                  <Text style={[styles.miniBtnText, { color: muted }]}>捨棄</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
        <Pressable onPress={handleClearAll} style={styles.clearRow}>
          <Text style={[styles.clearText, { color: danger }]}>清除所有整理紀錄</Text>
        </Pressable>

        <Text style={[styles.about, { color: muted }]}>
          揀影 v{Application.nativeApplicationVersion ?? 'dev'}（build{' '}
          {Application.nativeBuildVersion ?? 'dev'}）· 本機處理 · 免登入 · 原始照片不複製進 App
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16, gap: 8 },
  label: { fontSize: 12, marginTop: 8 },
  card: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  rowText: { fontSize: 15 },
  emptyText: { fontSize: 13, paddingVertical: 12 },
  recordRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  recordText: { flex: 1 },
  recordSub: { fontSize: 12, marginTop: 2 },
  miniBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  miniBtnText: { fontSize: 13, fontWeight: '700' },
  clearRow: { alignItems: 'center', paddingVertical: 10 },
  clearText: { fontSize: 13 },
  about: { fontSize: 12, textAlign: 'center', marginTop: 24, lineHeight: 18 },
});
