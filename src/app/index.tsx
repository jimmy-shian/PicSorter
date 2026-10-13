import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link, router } from 'expo-router';
import { usePermissions } from 'expo-media-library';
import { useSession } from '@/lib/session-context';
import { useTheme } from '@/lib/theme';
import { getAssetAlbumTitles, isLimitedAccess } from '@/lib/media';
import { SourceAlbumPicker } from '@/components/SourceAlbumPicker';
import { ClassifyPhoto } from '@/components/ClassifyPhoto';
import { AlbumBar } from '@/components/AlbumBar';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SpotlightTutorial } from '@/components/SpotlightTutorial';
import { Chevron, GearIcon, InfoIcon, UndoIcon } from '@/components/GestureIcons';
import type { SortOrder } from '@/types';

/**
 * 第一階段：照片分類
 * 左滑＝略過（不處理）· 右滑＝捨棄 · 上滑＝放入上滑目標相簿 · 下滑＝放入下滑目標相簿。
 * 底部右側 1~4 圓鈕點按選下滑目標（長按預覽全名），底部膠囊與全部清單點本體設上滑目標、
 * 清單列尾小按鈕設下滑目標；工具列 ⓘ 查看照片所在系統相簿。
 * 所有動作只寫入本機 SQLite，不動系統相簿。
 */
export default function ClassifyScreen() {
  const { bg, text, muted, border, card } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = usePermissions();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [emptyFinishVisible, setEmptyFinishVisible] = useState(false);
  const [inspectVisible, setInspectVisible] = useState(false);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectAlbums, setInspectAlbums] = useState<string[]>([]);
  const session = useSession();

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleSwipeUp = useCallback(async () => {
    const ok = await session.classifyCurrent('album');
    if (!ok) showNotice('分類失敗，請重試');
  }, [session, showNotice]);

  const handleTrash = useCallback(async () => {
    const ok = await session.classifyCurrent('trash');
    if (!ok) showNotice('標記失敗，請重試');
  }, [session, showNotice]);

  const handleSkip = useCallback(() => {
    const ok = session.skipCurrent();
    if (!ok) showNotice('沒有更多照片了');
  }, [session, showNotice]);

  const handleSwipeDown = useCallback(async () => {
    if (!session.downTargetId) {
      showNotice('請先在底部選擇下滑目標');
      return;
    }
    const title = session.targets.find((t) => t.id === session.downTargetId)?.title ?? '';
    const ok = await session.classifyCurrent('album', session.downTargetId);
    if (ok) showNotice(`已放入「${title}」`);
    else showNotice('分類失敗，請重試');
  }, [session, showNotice]);

  const currentItem = session.current;
  const handleInspect = useCallback(async () => {
    if (!currentItem) return;
    setInspectVisible(true);
    setInspectLoading(true);
    setInspectAlbums([]);
    try {
      const titles = await getAssetAlbumTitles(currentItem.assetId);
      setInspectAlbums(titles);
    } finally {
      setInspectLoading(false);
    }
  }, [currentItem]);

  const handleNeedTarget = useCallback(() => {
    showNotice('請先在底部選擇目標相簿');
  }, [showNotice]);

  const handleFinish = useCallback(() => {
    if (session.processedCount === 0) {
      setEmptyFinishVisible(true);
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
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.center, { backgroundColor: bg }]}>
        <Text style={{ color: muted }}>正在請求相簿權限…</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.center, { backgroundColor: bg }]}>
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
  const downTargetTitle = session.targets.find((t) => t.id === session.downTargetId)?.title ?? null;

  // P3：啟動恢復 gate。尚未就緒前不顯示照片，避免建出空白工作。
  if (session.boot !== 'ready') {
    const p = session.pendingResume;
    return (
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.center, { backgroundColor: bg }]}>
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
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.root, { backgroundColor: bg }]}>
      {/* 頂部導覽列：來源相簿選擇 ＋ 設定 ＋ 結束整理 */}
      <View style={[styles.header, { borderColor: border }]}>
        <Pressable onPress={() => setPickerVisible(true)} style={styles.sourceBtn} hitSlop={8}>
          <View style={styles.sourceRow}>
            <Text style={[styles.sourceText, { color: text }]} numberOfLines={1}>
              {session.source.title}
            </Text>
            <Chevron direction="down" size={14} color={muted} />
          </View>
        </Pressable>

        <View style={styles.headerRight}>
          <Pressable
            onPress={() => router.push('/settings')}
            hitSlop={8}
            accessibilityLabel="設定"
            style={[styles.iconBtn, { borderColor: border }]}>
            <GearIcon size={19} color={muted} />
          </Pressable>
          <Pressable onPress={handleFinish} style={[styles.finishBtn, { borderColor: text }]}>
            <Text style={{ color: text, fontWeight: '700', fontSize: 13 }}>結束</Text>
          </Pressable>
        </View>
      </View>

      {/* 次頂部資訊條：張數進度 ＋ 排序切換 */}
      <View style={[styles.subBar, { borderColor: border }]}>
        <Text style={[styles.counter, { color: muted }]}>
          {session.positionLabel} · 已分 {session.processedCount} · 待刪 {session.trashCount}
        </Text>
        <Pressable onPress={toggleSort} hitSlop={8} style={[styles.sortPill, { borderColor: border, backgroundColor: card }]}>
          <Text style={[styles.sortText, { color: muted }]}>
            {session.sortOrder === 'newest' ? '⇅ 最新優先' : '⇅ 最舊優先'}
          </Text>
        </Pressable>
      </View>

      {session.limitedAccess ? (
        <View style={[styles.limitedBanner, { borderColor: border }]}>
          <Text style={[styles.limitedText, { color: muted }]}>
            你只授權了部分照片，目前僅能整理已授權內容。
          </Text>
        </View>
      ) : null}

      {/* 中央照片（手勢卡） */}
      <View style={styles.photoArea}>
        {session.loading && session.queue.length === 0 ? (
          <Text style={{ color: muted }}>讀取照片中…</Text>
        ) : (
          <ClassifyPhoto
            key={session.current?.assetId ?? 'empty'}
            item={session.current}
            targetTitle={selectedTitle}
            downTargetTitle={downTargetTitle}
            canSwipeUp={session.selectedTargetId !== null}
            gestureSettings={session.gestureSettings}
            onSwipeUp={handleSwipeUp}
            onSwipeRight={handleTrash}
            onSwipeLeft={handleSkip}
            onSwipeDown={handleSwipeDown}
            onTrash={handleTrash}
            onNeedTarget={handleNeedTarget}
          />
        )}
      </View>
      {notice ? (
        <View style={styles.notice} pointerEvents="none">
          <Text style={styles.noticeText} numberOfLines={2}>{notice}</Text>
        </View>
      ) : null}

      {/* 精簡工具列：撤銷 + 查看所在相簿 + 檢查結果入口（精緻膠囊排版） */}
      <View style={styles.toolbar}>
        <View style={[styles.toolbarDock, { backgroundColor: card, borderColor: border }]}>
          <Pressable
            onPress={() => void session.undo()}
            disabled={!session.canUndo}
            hitSlop={8}
            style={[styles.dockBtn, !session.canUndo && styles.dockBtnDisabled]}>
            <UndoIcon size={16} color={session.canUndo ? text : muted} />
            <Text style={[styles.dockText, { color: session.canUndo ? text : muted }]}>
              撤銷
            </Text>
          </Pressable>
          <View style={[styles.dockDivider, { backgroundColor: border }]} />
          <Pressable
            onPress={() => void handleInspect()}
            disabled={!currentItem}
            hitSlop={8}
            accessibilityLabel="查看所在相簿"
            style={[styles.dockBtn, !currentItem && styles.dockBtnDisabled]}>
            <InfoIcon size={16} color={currentItem ? text : muted} />
            <Text style={[styles.dockText, { color: currentItem ? text : muted }]}>
              查看
            </Text>
          </Pressable>
          <View style={[styles.dockDivider, { backgroundColor: border }]} />
          <Link href="/review" asChild>
            <Pressable style={styles.dockBtn} hitSlop={8}>
              <Text style={[styles.dockText, { color: text }]}>
                檢查結果
              </Text>
              <View style={[styles.dockBadge, { backgroundColor: session.processedCount > 0 ? text : border }]}>
                <Text style={[styles.dockBadgeText, { color: session.processedCount > 0 ? bg : muted }]}>
                  {session.processedCount}
                </Text>
              </View>
              <Chevron direction="right" size={11} color={muted} />
            </Pressable>
          </Link>
        </View>
      </View>

      {/* 底部目標列：上滑目標膠囊＋下滑目標 1~4 快捷 */}
      <AlbumBar
        targets={session.targets}
        selectedId={session.selectedTargetId}
        downTargetId={session.downTargetId}
        onSelect={session.selectTarget}
        onSelectDown={session.selectDownTarget}
        onAdd={session.addTarget}
        sourceId={session.source.id}
        onOrderChanged={() => void session.refreshTargets()}
        dropMode={false}
        highlightId={null}
        expanded={expanded}
        onToggleExpand={toggleExpand}
      />

      <SourceAlbumPicker
        visible={pickerVisible}
        current={session.source}
        onSelect={session.setSource}
        onClose={() => setPickerVisible(false)}
      />

      <ConfirmDialog
        visible={emptyFinishVisible}
        title="尚無分類操作"
        message="先滑動分類至少一張照片，才能進入檢查。"
        confirmText="知道了"
        onConfirm={() => setEmptyFinishVisible(false)}
        onCancel={() => setEmptyFinishVisible(false)}
      />

      {/* 下滑查看：這張在系統哪些相簿裡 */}
      <Modal visible={inspectVisible} animationType="slide" transparent onRequestClose={() => setInspectVisible(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setInspectVisible(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: bg, borderColor: border, paddingBottom: insets.bottom + 16 }]}
            onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: text }]}>這張在哪些相簿</Text>
            <Text style={[styles.sheetSub, { color: muted }]}>只供查看，不會分類或移動相片與影片</Text>
            {inspectLoading ? (
              <Text style={[styles.sheetEmpty, { color: muted }]}>讀取中…</Text>
            ) : inspectAlbums.length === 0 ? (
              <Text style={[styles.sheetEmpty, { color: muted }]}>查不到所屬相簿（可能在「所有相片與影片」或系統未回報）。</Text>
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                {inspectAlbums.map((name) => (
                  <View key={name} style={[styles.inspectRow, { borderColor: border, backgroundColor: card }]}>
                    <Text style={[styles.inspectText, { color: text }]} numberOfLines={1}>{name}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
            <Pressable style={[styles.sheetDone, { backgroundColor: text }]} onPress={() => setInspectVisible(false)}>
              <Text style={[styles.sheetDoneText, { color: bg }]}>關閉</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <SpotlightTutorial
        visible={session.tutorialVisible}
        onClose={() => session.setTutorialVisible(false)}
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  sourceBtn: { flex: 1, minWidth: 0 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  sourceText: { fontSize: 17, fontWeight: '700', flexShrink: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishBtn: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sortPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sortText: { fontSize: 11, fontWeight: '600' },
  limitedBanner: { borderBottomWidth: 1, padding: 8 },
  limitedText: { fontSize: 12, textAlign: 'center' },
  counter: { fontSize: 12, fontWeight: '500' },
  photoArea: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  notice: {
    position: 'absolute',
    top: 132,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: '86%',
    zIndex: 5,
  },
  noticeText: { color: '#fff', fontSize: 13, textAlign: 'center' },
  toolbar: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  toolbarDock: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 10,
  },
  dockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  dockBtnDisabled: {
    opacity: 0.45,
  },
  dockText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dockDivider: {
    width: 1,
    height: 16,
  },
  dockBadge: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockBadgeText: {
    fontSize: 10,
    fontWeight: '700',
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
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 6,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#A8A29E',
    marginBottom: 6,
  },
  sheetTitle: { fontSize: 16, fontWeight: '800' },
  sheetSub: { fontSize: 12, marginBottom: 6 },
  sheetEmpty: { fontSize: 13, textAlign: 'center', paddingVertical: 16, lineHeight: 19 },
  inspectRow: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 8 },
  inspectText: { fontSize: 15 },
  sheetDone: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  sheetDoneText: { fontSize: 15, fontWeight: '700' },
});
