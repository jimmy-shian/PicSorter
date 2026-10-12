import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, router } from 'expo-router';
import { usePermissions } from 'expo-media-library';
import { useSharedValue } from 'react-native-reanimated';
import { useSession } from '@/lib/session-context';
import { useTheme } from '@/lib/theme';
import { isLimitedAccess } from '@/lib/media';
import { SourceAlbumPicker } from '@/components/SourceAlbumPicker';
import { ClassifyPhoto, type DragPoint } from '@/components/ClassifyPhoto';
import { AlbumBar, type AlbumBarHandle, type ChipRect } from '@/components/AlbumBar';
import type { SortOrder } from '@/types';

/**
 * 第一階段：照片分類（規格 §2）
 * 上滑＝放入選定相簿；下拖＝拖到指定相簿放開；左右滑＝待刪除。
 * 所有動作只寫入本機 SQLite，不動系統相簿（§2.5）。
 */
export default function ClassifyScreen() {
  const { bg, text, muted, border } = useTheme();
  const [permission, requestPermission] = usePermissions();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dropMode, setDropMode] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const session = useSession();

  const highlightShared = useSharedValue<string | null>(null);
  const boundsRef = useRef<Map<string, ChipRect>>(new Map());
  const highlightRef = useRef<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const albumBarRef = useRef<AlbumBarHandle | null>(null);

  useEffect(() => {
    if (permission === null) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    session.setLimitedAccess(isLimitedAccess(permission));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.accessPrivileges, permission?.granted]);

  // 權限就緒後啟動：有未完成工作則進入選擇，否則直接開新工作
  useEffect(() => {
    if (permission?.granted && session.boot === 'idle') {
      void session.startBoot();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.granted, session.boot]);

  // 照片接近尾聲時預取下一頁，避免斷層
  useEffect(() => {
    if (session.queue.length > 0 && session.index >= session.queue.length - 5) {
      void session.loadMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.index, session.queue.length]);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2200);
  }, []);

  const measureDropBounds = useCallback(async () => {
    try {
      const m = await albumBarRef.current?.measureChips();
      if (m && m.size > 0) boundsRef.current = m;
    } catch {
      // 量測失敗不阻斷流程：下拖改以回彈處理
    }
  }, []);

  const handleDropDragStart = useCallback(() => {
    setDropMode(true);
    // 相簿過多時自動展開，避免拖曳超出螢幕（§2.3）
    if (session.targets.length > 6) setExpanded(true);
    void measureDropBounds();
  }, [measureDropBounds, session.targets.length]);

  const handleDropDragMove = useCallback(
    (p: DragPoint) => {
      let found: string | null = null;
      for (const [id, r] of boundsRef.current) {
        if (p.x >= r.x - 8 && p.x <= r.x + r.width + 8 && p.y >= r.y - 10 && p.y <= r.y + r.height + 10) {
          found = id;
          break;
        }
      }
      if (highlightRef.current !== found) {
        highlightRef.current = found;
        highlightShared.value = found;
        setHighlightId(found);
      }
    },
    [highlightShared],
  );

  const handleDropDragEnd = useCallback(() => {
    highlightRef.current = null;
    highlightShared.value = null;
    setHighlightId(null);
    setDropMode(false);
  }, [highlightShared]);

  const handleBarLayoutReady = useCallback(() => {
    // 展開/收合改變版面時重新量測（僅下拖期間需要）
    void measureDropBounds();
  }, [measureDropBounds]);

  const handleSwipeUp = useCallback(async () => {
    const ok = await session.classifyCurrent('album');
    if (!ok) showNotice('分類失敗，請重試');
  }, [session, showNotice]);

  const handleTrash = useCallback(async () => {
    const ok = await session.classifyCurrent('trash');
    if (!ok) showNotice('標記失敗，請重試');
  }, [session, showNotice]);

  const handleDropToAlbum = useCallback(
    async (targetId: string) => {
      // 下拖不改變原本選定的預設相簿（§2.3），只用本次指定的目標
      const ok = await session.classifyCurrent('album', targetId);
      if (!ok) showNotice('分類失敗，請重試');
    },
    [session, showNotice],
  );

  const handleNeedTarget = useCallback(() => {
    showNotice('請先在底部選擇目標相簿');
  }, [showNotice]);

  const handleFinish = useCallback(() => {
    if (session.processedCount === 0) {
      Alert.alert('尚無分類操作', '先滑動分類至少一張照片，才能進入檢查。');
      return;
    }
    router.push({ pathname: '/review', params: { sessionId: session.sessionId ?? '' } });
  }, [session.processedCount, session.sessionId]);

  const toggleSort = useCallback(() => {
    const next: SortOrder = session.sortOrder === 'newest' ? 'oldest' : 'newest';
    session.setSortOrder(next);
  }, [session]);

  const toggleExpand = useCallback(() => setExpanded((v) => !v), []);

  if (permission === null) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: bg }]}>
        <Text style={{ color: muted }}>正在請求相簿權限…</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: bg }]}>
        <Text style={[styles.title, { color: text }]}>需要相簿權限</Text>
        <Text style={[styles.desc, { color: muted }]}>
          揀影只在本機整理照片，不會上傳。請允許讀取照片才能開始。
        </Text>
        <Pressable style={[styles.primaryBtn, { borderColor: text }]} onPress={() => void requestPermission()}>
          <Text style={{ color: text, fontWeight: '700' }}>要求權限</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const selectedTitle = session.targets.find((t) => t.id === session.selectedTargetId)?.title ?? null;

  // P3：啟動恢復 gate。尚未就緒前不顯示照片，避免建出空白工作。
  if (session.boot !== 'ready') {
    const p = session.pendingResume;
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: bg }]}>
        {session.boot !== 'choice' || !p ? (
          <Text style={{ color: muted }}>載入整理進度…</Text>
        ) : (
          <View style={[styles.resumeCard, { borderColor: border }]}>
            <Text style={[styles.title, { color: text }]}>上次整理到一半</Text>
            <Text style={[styles.desc, { color: muted }]}>
              {p.sourceTitle} · 已分 {p.processed} 張 · 待刪 {p.trash} 張
            </Text>
            <Pressable
              style={[styles.resumePrimary, { backgroundColor: text }]}
              onPress={() => void session.chooseResume()}>
              <Text style={{ color: bg, fontWeight: '700' }}>繼續上次</Text>
            </Pressable>
            <Pressable
              style={[styles.resumeGhost, { borderColor: border }]}
              onPress={() => void session.chooseFresh()}>
              <Text style={{ color: muted }}>重新開始</Text>
            </Pressable>
            <Text style={[styles.resumeNote, { color: muted }]}>
              重新開始會捨棄上次的未套用紀錄（尚未寫入系統相簿，不影響照片本身）
            </Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bg }]}>
      {/* 頂部：來源選擇 + 排序 + 結束 */}
      <View style={[styles.header, { borderColor: border }]}>
        <Pressable onPress={() => setPickerVisible(true)} style={styles.sourceBtn}>
          <Text style={[styles.sourceText, { color: text }]}>{session.source.title} ▼</Text>
        </Pressable>
        <Pressable onPress={toggleSort}>
          <Text style={[styles.smallBtn, { color: muted }]}>
            {session.sortOrder === 'newest' ? '最新→最舊' : '最舊→最新'}
          </Text>
        </Pressable>
        <Pressable onPress={handleFinish} style={[styles.finishBtn, { borderColor: text }]}>
          <Text style={{ color: text, fontWeight: '700' }}>結束</Text>
        </Pressable>
      </View>

      {session.limitedAccess ? (
        <View style={[styles.limitedBanner, { borderColor: border }]}>
          <Text style={[styles.limitedText, { color: muted }]}>
            你只授權了部分照片，目前僅能整理已授權內容。
          </Text>
        </View>
      ) : null}

      {/* 張數 */}
      <Text style={[styles.counter, { color: muted }]}>
        {session.positionLabel} · 已分 {session.processedCount} · 待刪 {session.trashCount}
      </Text>

      {/* 中央照片（手勢卡） */}
      <View style={styles.photoArea}>
        {session.loading && session.queue.length === 0 ? (
          <Text style={{ color: muted }}>讀取照片中…</Text>
        ) : (
          <ClassifyPhoto
            key={session.current?.assetId ?? 'empty'}
            item={session.current}
            targetTitle={selectedTitle}
            canSwipeUp={session.selectedTargetId !== null}
            highlightShared={highlightShared}
            onSwipeUp={handleSwipeUp}
            onTrash={handleTrash}
            onDropToAlbum={handleDropToAlbum}
            onDropDragStart={handleDropDragStart}
            onDropDragMove={handleDropDragMove}
            onDropDragEnd={handleDropDragEnd}
            onNeedTarget={handleNeedTarget}
          />
        )}
      </View>
      {notice ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      {/* 精簡工具列：小型撤銷 + 檢查入口（中央不放大型按鈕） */}
      <View style={styles.toolbar}>
        <Pressable
          onPress={() => void session.undo()}
          disabled={!session.canUndo}
          style={styles.undoBtn}>
          <Text style={{ color: session.canUndo ? text : muted, fontSize: 13 }}>
            ↩ 撤銷
          </Text>
        </Pressable>
        <Link href="/review" style={[styles.link, { color: muted }]}>
          檢查結果（{session.processedCount}）›
        </Link>
        <Link href="/settings" style={[styles.link, { color: muted }]}>
          設定
        </Link>
      </View>

      {/* 底部目標列（下拖時顯示可放入提示 + 命中高亮） */}
      <AlbumBar
        ref={albumBarRef}
        targets={session.targets}
        selectedId={session.selectedTargetId}
        onSelect={session.selectTarget}
        onAdd={session.addTarget}
        sourceId={session.source.id}
        onOrderChanged={() => void session.refreshTargets()}
        dropMode={dropMode}
        highlightId={highlightId}
        expanded={expanded}
        onToggleExpand={toggleExpand}
        onLayoutReady={handleBarLayoutReady}
      />

      <SourceAlbumPicker
        visible={pickerVisible}
        current={session.source}
        onSelect={session.setSource}
        onClose={() => setPickerVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  desc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  primaryBtn: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  sourceBtn: { flex: 1 },
  sourceText: { fontSize: 17, fontWeight: '700' },
  smallBtn: { fontSize: 12 },
  finishBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  limitedBanner: { borderBottomWidth: 1, padding: 8 },
  limitedText: { fontSize: 12, textAlign: 'center' },
  counter: { fontSize: 11, textAlign: 'center', marginTop: 6 },
  photoArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notice: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  noticeText: { color: '#fff', fontSize: 13 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 6,
  },
  resumeCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 20,
    width: '100%',
    gap: 12,
  },
  resumePrimary: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  resumeGhost: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  resumeNote: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
  undoBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  link: { fontSize: 12 },
});
