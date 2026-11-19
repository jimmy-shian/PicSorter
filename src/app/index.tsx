import { MilestoneAdModal } from '@/components/MilestoneAdModal';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link, router } from 'expo-router';
import * as Linking from 'expo-linking';
import { presentPermissionsPicker, usePermissions } from 'expo-media-library';
import { useSQLiteContext } from 'expo-sqlite';
import { getPref, setPref } from '@/lib/db';
import { useSession } from '@/lib/session-context';
import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { getAssetAlbumTitles, isLimitedAccess } from '@/lib/media';
import { SourceAlbumPicker } from '@/components/SourceAlbumPicker';
import { ClassifyPhoto } from '@/components/ClassifyPhoto';
import { AlbumBar, type AlbumBarHandle } from '@/components/AlbumBar';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SpotlightTutorial } from '@/components/SpotlightTutorial';
import { Chevron, GearIcon, InfoIcon, SortIcon, UndoIcon } from '@/components/GestureIcons';
import type { SortOrder } from '@/types';

/**
 * 第一階段：照片分類
 * 左滑＝略過（不處理）· 右滑＝捨棄 · 上滑＝放入上滑目標相簿 · 下滑＝放入下滑目標相簿。
 * 底部四張單層相簿卡片可點選分類，長按照片後也可拖曳放入；上下滑目標獨立設定。
 * 點按照片＝開手機內建相片檢視（系統縮放）；工具列 ⓘ 查看照片所在系統相簿。
 * 所有動作只寫入本機 SQLite，不動系統相簿。
 */
export default function ClassifyScreen() {
  const { bg, text, muted, border, card, dark } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight, fontScale } = useWindowDimensions();
  // 排序按鈕改用實測的 subBar 寬度判斷可用空間；首次量測前以視窗寬度（扣 insets）推估，
  // 避免某些 Android 裝置 insets 回傳異常偏大導致永遠只顯示圖示。
  const [subBarWidth, setSubBarWidth] = useState<number | null>(null);
  const showSortLabel =
    subBarWidth !== null
      ? subBarWidth >= 220 * fontScale
      : windowWidth - insets.left - insets.right >= 240 * fontScale;
  const [screenHeight, setScreenHeight] = useState(windowHeight);
  const bottomLimit = Math.floor(Math.max(0, screenHeight - insets.top - insets.bottom) * 0.25);
  const bottomControls = useRef<View>(null);
  const [permission, requestPermission, getPermission] = usePermissions();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [permissionActionBusy, setPermissionActionBusy] = useState(false);
  const [permissionActionError, setPermissionActionError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dropMode, setDropMode] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const albumBar = useRef<AlbumBarHandle>(null);
  const [bottomBlockHeight, setBottomBlockHeight] = useState(0);
  const measureBottom = useCallback(() => {
    bottomControls.current?.measureInWindow((x, y, width, height) => {
      albumBar.current?.setViewport({ x, y, width, height });
      albumBar.current?.refreshLayout();
    });
  }, []);
  const onBottomLayout = useCallback((event: LayoutChangeEvent) => {
    setBottomBlockHeight(event.nativeEvent.layout.height);
  }, []);
  const finishDrag = useCallback(() => { albumBar.current?.setPointer(null); setDropMode(false); setHighlightId(null); }, []);
  const startDrag = useCallback(() => { setHighlightId(null); setDropMode(true); }, []);
  const moveDrag = useCallback((point: { x: number; y: number }) => albumBar.current?.setPointer(point), []);
  const [emptyFinishVisible, setEmptyFinishVisible] = useState(false);
  const [inspectVisible, setInspectVisible] = useState(false);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectAlbums, setInspectAlbums] = useState<string[]>([]);
  const db = useSQLiteContext();
  const session = useSession();
  const [sortedCount, setSortedCount] = useState(0);
  const sortedCountRef = useRef(0);
  const sinceLastAdRef = useRef(0);
  const [milestoneVisible, setMilestoneVisible] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      getPref(db, 'milestone_sorted_total', '0'),
      getPref(db, 'milestone_since_last_ad', '0'),
    ])
      .then(([rawTotal, rawSince]) => {
        if (!active) return;
        const parsedTotal = parseInt(rawTotal, 10);
        const total = Number.isFinite(parsedTotal) && parsedTotal >= 0 ? parsedTotal : 0;
        const parsedSince = parseInt(rawSince, 10);
        const sinceLast = Number.isFinite(parsedSince) && parsedSince >= 0 ? parsedSince : 0;
        const syncedTotal = Math.max(total, session.processedCount);
        sortedCountRef.current = syncedTotal;
        sinceLastAdRef.current = sinceLast;
        setSortedCount(syncedTotal);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // 啟動時從 DB 載入累計數即可，後續由下方 processedCount 同步與 incrementCount 維護
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  useEffect(() => {
    if (session.processedCount > sortedCountRef.current) {
      sortedCountRef.current = session.processedCount;
    }
  }, [session.processedCount]);

  const incrementCount = useCallback(() => {
    const nextTotal = Math.max(sortedCountRef.current + 1, session.processedCount + 1);
    const nextSinceLast = sinceLastAdRef.current + 1;
    const sessionNext = session.processedCount + 1;
    sortedCountRef.current = nextTotal;

    if (nextSinceLast >= 50 || (sessionNext > 0 && sessionNext % 50 === 0 && nextSinceLast >= 1)) {
      sinceLastAdRef.current = 0;
      const displayCount = sessionNext > 0 && sessionNext % 50 === 0 ? sessionNext : nextTotal;
      setSortedCount(displayCount);
      setMilestoneVisible(true);
      void Promise.all([
        setPref(db, 'milestone_sorted_total', String(nextTotal)),
        setPref(db, 'milestone_since_last_ad', '0'),
      ]).catch(() => {});
      return;
    }

    sinceLastAdRef.current = nextSinceLast;
    setSortedCount(nextTotal);
    void Promise.all([
      setPref(db, 'milestone_sorted_total', String(nextTotal)),
      setPref(db, 'milestone_since_last_ad', String(nextSinceLast)),
    ]).catch(() => {});
  }, [db, session.processedCount]);

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appState = useRef(AppState.currentState);
  const permissionRef = useRef(permission);
  const refreshAfterSettingsRef = useRef(false);

  useEffect(() => {
    permissionRef.current = permission;
  }, [permission]);

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

  const openAppPermissionSettings = useCallback(async () => {
    refreshAfterSettingsRef.current = Boolean(permission?.granted);
    try {
      await Linking.openSettings();
    } catch {
      refreshAfterSettingsRef.current = false;
      setPermissionActionError(t('home.permissionErrorOpenSettings'));
    }
  }, [permission?.granted, t]);

  const handleRequestPhotoAccess = useCallback(async () => {
    if (permissionActionBusy) return;
    setPermissionActionBusy(true);
    setPermissionActionError(null);
    try {
      if (permission?.canAskAgain) {
        const updatedPermission = await requestPermission();
        if (updatedPermission.granted && session.boot === 'ready') session.setSource(session.source);
      } else {
        await openAppPermissionSettings();
      }
    } catch {
      setPermissionActionError(t('home.permissionErrorRequest'));
    } finally {
      setPermissionActionBusy(false);
    }
  }, [openAppPermissionSettings, permission, permissionActionBusy, requestPermission, session, t]);

  const handleManagePhotoAccess = useCallback(async () => {
    if (permissionActionBusy) return;
    setPermissionActionBusy(true);
    setPermissionActionError(null);
    try {
      const supportsPicker = Platform.OS === 'ios' || (Platform.OS === 'android' && Number(Platform.Version) >= 34);
      if (supportsPicker) {
        await presentPermissionsPicker();
        await getPermission();
        session.setSource(session.source);
      } else {
        await openAppPermissionSettings();
      }
    } catch {
      setPermissionActionError(t('home.permissionErrorPicker'));
      await openAppPermissionSettings();
    } finally {
      setPermissionActionBusy(false);
    }
  }, [getPermission, openAppPermissionSettings, permissionActionBusy, session, t]);

  const classifyToAlbum = session.classifyCurrent;
  const dropPhoto = useCallback(async (point: { x: number; y: number }): Promise<boolean> => {
    albumBar.current?.setPointer(null);
    try {
      const id = await albumBar.current?.getDropTarget(point);
      if (id) {
        const ok = await classifyToAlbum('album', id);
        if (!ok) {
          showNotice(t('home.classifyFailed'));
          return false;
        }
        incrementCount();
        return true;
      }
      return false;
    } catch {
      showNotice(t('home.classifyFailed'));
      return false;
    } finally {
      finishDrag();
    }
  }, [classifyToAlbum, finishDrag, incrementCount, showNotice, t]);
  const quickLock = useRef(false);
  const quickClassify = useCallback(async (id: string) => {
    if (quickLock.current) return;
    quickLock.current = true;
    try {
      const ok = await classifyToAlbum('album', id);
      if (ok) incrementCount();
      else showNotice(t('home.classifyFailed'));
    }
    catch { showNotice(t('home.classifyFailed')); }
    finally { quickLock.current = false; }
  }, [classifyToAlbum, incrementCount, showNotice, t]);
  const gestureError = useCallback(() => showNotice(t('home.actionFailed')), [showNotice, t]);
  // 長按底部快捷晶片：頂部通知顯示完整相簿名稱（Pressable 長按後不會再觸發 onPress 分類）
  const showAlbumFullName = useCallback((id: string) => {
    const album = session.targets.find((t) => t.id === id);
    if (album) showNotice(album.title.trim() || t('common.notSet'));
  }, [session.targets, showNotice, t]);

  // 從系統相片檢視器回來後，外部 App 可能已刪除目前照片。
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const returnedToApp = appState.current !== 'active' && nextState === 'active';
      appState.current = nextState;
      if (!returnedToApp) return;
      void getPermission().then((updatedPermission) => {
        const previousPermission = permissionRef.current;
        const shouldRefreshQueue =
          refreshAfterSettingsRef.current ||
          !previousPermission?.granted && updatedPermission.granted ||
          previousPermission?.accessPrivileges !== updatedPermission.accessPrivileges;
        refreshAfterSettingsRef.current = false;
        permissionRef.current = updatedPermission;
        if (updatedPermission.granted) setPermissionActionError(null);
        if (shouldRefreshQueue && updatedPermission.granted && session.boot === 'ready') {
          session.setSource(session.source);
        }
      });
      void session.refreshCurrentAsset().then((result) => {
        if (result === 'missing') showNotice(t('home.photoDeleted'));
      });
    });
    return () => subscription.remove();
  }, [getPermission, session, showNotice, t]);

  const handleSwipeUp = useCallback(async () => {
    const ok = await session.classifyCurrent('album');
    if (ok) incrementCount();
    if (!ok) showNotice(t('home.classifyFailedRetry'));
  }, [session, showNotice, incrementCount, t]);

  const handleTrash = useCallback(async () => {
    const ok = await session.classifyCurrent('trash');
    if (ok) incrementCount();
    if (!ok) showNotice(t('home.markFailed'));
  }, [session, showNotice, incrementCount, t]);

  const handleSkip = useCallback(async () => {
    const ok = await session.skipCurrent();
    if (ok) incrementCount();
    if (!ok) showNotice(t('home.noMorePhotos'));
  }, [session, showNotice, incrementCount, t]);

  const handleSwipeDown = useCallback(async () => {
    if (!session.downTargetId) {
      showNotice(t('home.setDownTarget'));
      return;
    }
    const title = session.targets.find((t) => t.id === session.downTargetId)?.title ?? '';
    const ok = await session.classifyCurrent('album', session.downTargetId);
    if (ok) incrementCount();
    if (ok) showNotice(t('home.addedToAlbum', { title }));
    else showNotice(t('home.classifyFailedRetry'));
  }, [session, showNotice, incrementCount, t]);

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
    showNotice(t('home.setUpTarget'));
  }, [showNotice, t]);

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
        <Text style={{ color: muted }}>{t('home.requestingPermission')}</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.center, { backgroundColor: bg }]}>
        <Text style={[styles.title, { color: text }]}>{t('home.permissionRequiredTitle')}</Text>
        <Text style={[styles.desc, { color: muted }]}>
          {t('home.permissionRationale')}
          {!permission.canAskAgain ? '\n' + t('home.permissionLimitedHint') : ''}
        </Text>
        {permissionActionError ? <Text style={[styles.permissionError, { color: muted }]}>{permissionActionError}</Text> : null}
        <Pressable
          style={[styles.primaryBtn, { borderColor: text }, permissionActionBusy && styles.permissionBtnDisabled]}
          disabled={permissionActionBusy}
          onPress={() => void handleRequestPhotoAccess()}>
          <Text style={{ color: text, fontWeight: '700' }}>
            {permissionActionBusy ? t('common.loading') : permission.canAskAgain ? t('home.buttonReRequestPermission') : t('home.buttonOpenSettings')}
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const selectedTitle = session.targets.find((t) => t.id === session.selectedTargetId)?.title ?? null;
  const downTargetTitle = session.targets.find((t) => t.id === session.downTargetId)?.title ?? null;
  const highlightAlbum = session.targets.find((t) => t.id === highlightId);
  const highlightTitle = highlightAlbum?.title ?? null;

  // P3：啟動恢復 gate。尚未就緒前不顯示照片，避免建出空白工作。
  if (session.boot !== 'ready') {
    const p = session.pendingResume;
    return (
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.center, { backgroundColor: bg }]}>
        {session.boot !== 'choice' || !p ? (
          <Text style={{ color: muted }}>{t('home.loadingProgress')}</Text>
        ) : (
          <View style={[styles.resumeCard, { borderColor: border }]}>
            <Text style={[styles.title, { color: text }]}>{t('home.resumeTitle')}</Text>
            <Text style={[styles.desc, { color: muted }]}>
              {t('home.resumeStats', { source: p.sourceTitle, done: p.processed, trash: p.trash })}
            </Text>
            <Pressable
              style={[styles.resumePrimary, { backgroundColor: text }]}
              onPress={() => void session.chooseResume()}>
              <Text style={{ color: bg, fontWeight: '700' }}>{t('home.resumeButton')}</Text>
            </Pressable>
            <Pressable
              style={[styles.resumeGhost, { borderColor: border }]}
              onPress={() => void session.chooseFresh()}>
              <Text style={{ color: muted }}>{t('home.restartButton')}</Text>
            </Pressable>
            <Text style={[styles.resumeNote, { color: muted }]}>
              {t('home.restartWarning')}
            </Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.root, { backgroundColor: bg }]} onLayout={(event) => setScreenHeight(event.nativeEvent.layout.height)}>
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
            accessibilityLabel={t('home.accessibilitySettings')}
            style={[styles.iconBtn, { borderColor: border }]}>
            <GearIcon size={19} color={muted} />
          </Pressable>
          <Pressable onPress={handleFinish} style={[styles.finishBtn, { borderColor: text }]}>
            <Text style={{ color: text, fontWeight: '700', fontSize: 13 }}>{t('home.finishButton')}</Text>
          </Pressable>
        </View>
      </View>

      {/* 次頂部資訊條：張數進度 ＋ 排序切換 */}
      <View
        style={[styles.subBar, { borderColor: border }]}
        onLayout={(event) => setSubBarWidth(event.nativeEvent.layout.width)}>
        <Text numberOfLines={1} style={[styles.counter, { color: muted }]}>
          {session.positionLabel.replace(/\s/g, '')}
        </Text>
        <Pressable
          onPress={toggleSort}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('home.accessibilitySortToggle', { order: session.sortOrder === 'newest' ? t('home.sortNewestShort') : t('home.sortOldestShort') })}
          style={[
            styles.sortPill,
            showSortLabel ? styles.sortPillWithLabel : styles.sortPillIconOnly,
            { borderColor: border, backgroundColor: card },
          ]}>
          <SortIcon size={18} color={muted} />
          {showSortLabel ? (
            <Text style={[styles.sortLabel, { color: muted }]}>
              {session.sortOrder === 'newest' ? t('home.labelSortNewest') : t('home.labelSortOldest')}
            </Text>
          ) : null}
        </Pressable>
      </View>

      {session.limitedAccess ? (
        <View style={[styles.limitedBanner, { borderColor: border }]}>
          <Text style={[styles.limitedText, { color: muted, flex: 1 }]}>
            {t('home.partialAccessHint')}
          </Text>
          <Pressable
            onPress={() => void handleManagePhotoAccess()}
            disabled={permissionActionBusy}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('home.accessibilityPermissionChange')}
            style={permissionActionBusy && styles.permissionBtnDisabled}>
            <Text style={[styles.limitedManage, { color: text }]}>
              {permissionActionBusy ? t('common.loading') : t('home.buttonChangePermission')}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {session.limitedAccess && permissionActionError ? (
        <Text style={[styles.permissionError, { color: muted, textAlign: 'center' }]}>{permissionActionError}</Text>
      ) : null}

      {/* 中央照片（手勢卡）：重建待處理列（換來源/排序）時顯示載入中，避免殘留舊排序照片造成錯覺 */}
      <View style={[styles.photoArea, dropMode && { zIndex: 10, elevation: 10 }]} pointerEvents="box-none">
        {session.reloading || (session.loading && session.queue.length === 0) ? (
          <Text style={{ color: muted }}>{t('home.loadingPhotos')}</Text>
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
            onError={gestureError}
            onDragStart={startDrag}
            onDragMove={moveDrag}
            onDragCancel={finishDrag}
            onDrop={dropPhoto}
            highlightTitle={highlightTitle}
          />
        )}
      </View>
      {notice ? (
        <View
          style={[styles.notice, {
            bottom: insets.bottom + bottomBlockHeight + 12,
            backgroundColor: dark ? text : 'rgba(0,0,0,0.78)',
          }]}
          pointerEvents="none">
          <Text style={[styles.noticeText, dark && { color: bg }]} numberOfLines={2}>{notice}</Text>
        </View>
      ) : null}

      <View ref={bottomControls} collapsable={false} style={{ maxHeight: bottomLimit, flexShrink: 0 }} onLayout={(event) => { onBottomLayout(event); measureBottom(); }}>
      <ScrollView style={{ flexGrow: 0, maxHeight: bottomLimit }} bounces={false} scrollEnabled={!dropMode}
        onScroll={measureBottom} scrollEventThrottle={16} contentInsetAdjustmentBehavior="never">
      {/* 底部所有操作合計最多佔安全內容高度的 25%；短螢幕或大字體可捲動。 */}
      <View style={styles.toolbar}>
        <View style={[styles.toolbarDock, { backgroundColor: card, borderColor: border }]}>
          <Pressable
            onPress={() => void session.undo()}
            disabled={!session.canUndo}
            hitSlop={8}
            style={[styles.dockBtn, !session.canUndo && styles.dockBtnDisabled]}>
            <UndoIcon size={16} color={session.canUndo ? text : muted} />
            <Text numberOfLines={1} style={[styles.dockText, { color: session.canUndo ? text : muted }]}>
              {t('home.undo')}
            </Text>
          </Pressable>
          <View style={[styles.dockDivider, { backgroundColor: border }]} />
          <Pressable
            onPress={() => void handleInspect()}
            disabled={!currentItem}
            hitSlop={8}
            accessibilityLabel={t('home.accessibilityViewAlbum')}
            style={[styles.dockBtn, !currentItem && styles.dockBtnDisabled]}>
            <InfoIcon size={16} color={currentItem ? text : muted} />
            <Text numberOfLines={1} style={[styles.dockText, { color: currentItem ? text : muted }]}>
              {t('home.inspect')}
            </Text>
          </Pressable>
          <View style={[styles.dockDivider, { backgroundColor: border }]} />
          <Link href="/review" asChild>
            <Pressable style={styles.dockBtn} hitSlop={8}>
              <Text numberOfLines={1} style={[styles.dockText, { color: text }]}>
                {t('home.results')}
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

      {/* 上滑目標與四個扁平文字選項，下滑目標以高亮表示。 */}
      <AlbumBar
        ref={albumBar}
        onHover={setHighlightId}
        targets={session.targets}
        selectedId={session.selectedTargetId}
        downTargetId={session.downTargetId}
        shortcutIds={session.shortcutIds}
        onClassify={quickClassify}
        onSelectDownTarget={session.selectDownTarget}
        onLongPress={showAlbumFullName}
        sourceId={session.source.id}
        onOrderChanged={session.refreshTargets}
        dropMode={dropMode}
        highlightId={highlightId}
        expanded={expanded}
        onToggleExpand={toggleExpand}
      />
      </ScrollView>
      </View>

      <SourceAlbumPicker
        visible={pickerVisible}
        current={session.source}
        onSelect={session.setSource}
        onClose={() => setPickerVisible(false)}
      />

      <ConfirmDialog
        visible={emptyFinishVisible}
        title={t('home.dialogNoActionsTitle')}
        message={t('home.dialogNoActionsMessage')}
        confirmText={t('home.dialogNoActionsConfirm')}
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
            <Text style={[styles.sheetTitle, { color: text }]}>{t('home.whichAlbums')}</Text>
            <Text style={[styles.sheetSub, { color: muted }]}>{t('home.inspectHint')}</Text>
            {inspectLoading ? (
              <Text style={[styles.sheetEmpty, { color: muted }]}>{t('common.reading')}</Text>
            ) : inspectAlbums.length === 0 ? (
              <Text style={[styles.sheetEmpty, { color: muted }]}>{t('home.noAlbumInfo')}</Text>
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
              <Text style={[styles.sheetDoneText, { color: bg }]}>{t('common.close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <SpotlightTutorial
        visible={session.tutorialVisible}
        onClose={() => session.setTutorialVisible(false)}
      />

      <MilestoneAdModal
        visible={milestoneVisible}
        sortedCount={sortedCount}
        onClose={() => setMilestoneVisible(false)}
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
    width: 44,
    height: 44,
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
    gap: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sortPill: {
    borderWidth: 1,
    borderRadius: 999,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortPillWithLabel: { flexDirection: 'row', gap: 5, paddingHorizontal: 8 },
  sortPillIconOnly: { width: 34 },
  sortLabel: { fontSize: 11, fontWeight: '600' },
  limitedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, padding: 8 },
  limitedText: { fontSize: 12 },
  limitedManage: { fontSize: 12, fontWeight: '700', paddingLeft: 8 },
  permissionBtnDisabled: { opacity: 0.55 },
  permissionError: { fontSize: 12, textAlign: 'center' },
  counter: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: '500' },
  photoArea: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  notice: {
    position: 'absolute',
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
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  toolbarDock: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 0,
    gap: 4,
  },
  dockBtn: {
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
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
    flexShrink: 1,
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
