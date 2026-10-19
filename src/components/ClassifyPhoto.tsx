import { useCallback, useMemo, useState } from 'react';
import { Image as RNImage, PixelRatio, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';
import type { ClassifyItem, GestureAction, GestureSettings } from '@/types';
import { ArrowCircle } from '@/components/GestureIcons';
import { openSystemPhotoViewer } from '@/lib/system-viewer';

/** 渲染階段狀態，用於多層自癒備援 */
type RenderStage = 'expo-primary' | 'expo-fallback' | 'native-primary' | 'native-fallback';

/** 觸發門檻（px） */
const UP_THRESHOLD = -85;
const DOWN_THRESHOLD = 85;
const H_THRESHOLD = 90;
const FLY_DISTANCE = 680;

export interface DragPoint {
  x: number;
  y: number;
}

interface Props {
  item: ClassifyItem | null;
  targetTitle: string | null;
  /** 下滑目標名稱：下滑手勢現為分類（非查看），提示用 */
  downTargetTitle?: string | null;
  canSwipeUp: boolean;
  gestureSettings?: GestureSettings;
  onSwipeUp: () => void;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  onSwipeDown?: () => void;
  onTrash?: () => void;
  onNeedTarget: () => void;
  onError: () => void;
  onDragStart: () => void;
  onDragMove: (point: DragPoint) => void;
  onDrop: (point: DragPoint) => Promise<boolean>;
  onDragCancel: () => void;
  highlightTitle?: string | null;
}

function snapBack(tx: SharedValue<number>, ty: SharedValue<number>) {
  'worklet';
  tx.value = withSpring(0, { damping: 18, stiffness: 220 });
  ty.value = withSpring(0, { damping: 18, stiffness: 220 });
}

export function ClassifyPhoto({
  item,
  targetTitle,
  downTargetTitle,
  canSwipeUp,
  gestureSettings = { up: 'album', down: 'inspect', left: 'skip', right: 'trash' },
  onSwipeUp,
  onSwipeRight,
  onSwipeLeft,
  onSwipeDown,
  onTrash,
  onNeedTarget, onError, onDragStart, onDragMove, onDrop, onDragCancel,
  highlightTitle,
}: Props) {
  const { bg, muted } = useTheme();

  const [area, setArea] = useState({ width: 0, height: 0 });
  const [stageState, setStageState] = useState<{ id: string; stage: RenderStage }>({
    id: '',
    stage: 'expo-primary',
  });

  const stage = stageState.id === item?.assetId ? stageState.stage : 'expo-primary';

  const activeUri = useMemo(() => {
    if (!item) return '';
    if (stage === 'expo-fallback' || stage === 'native-fallback') {
      return item.fallbackUri || item.uri;
    }
    return item.uri;
  }, [item, stage]);

  /**
   * 載入失敗多層自癒機制：
   * 1. expo-primary 失敗 -> 嘗試 expo-fallback（例如切換 content:// 或 file://）。
   * 2. expo-fallback 失敗（或無 fallbackUri）-> 切換到 native-primary（React Native 原生 Fresco 解碼引擎）。
   * 3. native-primary 失敗 -> 切換到 native-fallback。
   */
  const handleLoadError = useCallback(() => {
    const id = item?.assetId ?? '';
    if (!id) return;
    setStageState((prev) => {
      const currentStage = prev.id === id ? prev.stage : 'expo-primary';
      let nextStage: RenderStage = 'expo-primary';
      if (currentStage === 'expo-primary') {
        nextStage = item?.fallbackUri ? 'expo-fallback' : 'native-primary';
      } else if (currentStage === 'expo-fallback') {
        nextStage = 'native-primary';
      } else if (currentStage === 'native-primary') {
        nextStage = item?.fallbackUri ? 'native-fallback' : 'native-primary';
      } else {
        nextStage = 'native-fallback';
      }
      return { id, stage: nextStage };
    });
  }, [item?.assetId, item?.fallbackUri]);

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const lock = useSharedValue(false);

  /**
   * 點按照片 → 打開手機「內建相片檢視」（Android Intent ACTION_VIEW）。
   * 縮放、雙擊、拖曳、全螢幕全部由系統檢視器原生處理，
   * App 不再自製縮放器（自製 pinch 在 Modal 內曾出現斷線與掉幀）。
   */
  const openSystemViewer = useMemo(() => {
    return async () => {
      if (!item) return;
      await openSystemPhotoViewer(item.assetId, activeUri || item.uri, item.mediaType);
    };
  }, [item, activeUri]);

  const handleRight = useMemo(() => {
    if (onSwipeRight) return onSwipeRight;
    if (onTrash) return onTrash;
    return () => {};
  }, [onSwipeRight, onTrash]);

  const completeSwipe = useCallback(async (action: GestureAction) => {
    try {
      if (action === 'album') await onSwipeUp();
      else if (action === 'inspect') await onSwipeDown?.();
      else if (action === 'trash') await handleRight();
      else if (action === 'skip') await (onSwipeLeft ?? handleRight)();
    } catch { onError(); }
    finally { snapBack(tx, ty); lock.value = false; onDragCancel(); }
  }, [onSwipeUp, onSwipeDown, handleRight, onSwipeLeft, onError, tx, ty, lock, onDragCancel]);

  const dispatchAction = useCallback((action: GestureAction, flyX: number, flyY: number) => {
    if (action === 'none') { snapBack(tx, ty); return; }
    if (action === 'album' && !canSwipeUp) { snapBack(tx, ty); onNeedTarget(); return; }
    lock.value = true;
    tx.value = withTiming(flyX, { duration: 220 });
    ty.value = withTiming(flyY, { duration: 220 }, (done) => {
      if (done) runOnJS(completeSwipe)(action);
    });
  }, [canSwipeUp, onNeedTarget, completeSwipe, lock, tx, ty]);

  const handleDropOrSwipeDown = useCallback(
    async ({ x, y, dy, vy, horizontal }: { x: number; y: number; dy: number; vy: number; horizontal: boolean }) => {
      try {
        const dropped = await onDrop({ x, y });
        if (dropped) {
          // 成功放入相簿：執行動畫縮小入庫
          tx.value = withTiming(0, { duration: 140 });
          ty.value = withTiming(FLY_DISTANCE, { duration: 180 }, (done) => {
            if (done) {
              lock.value = false;
              snapBack(tx, ty);
            }
          });
          return;
        }

        // 未命中相簿：檢查是否符合快速向下滑動手勢
        if (!horizontal && dy > 0 && (dy > DOWN_THRESHOLD || (vy > 900 && dy > 40))) {
          dispatchAction(gestureSettings.down, 0, FLY_DISTANCE);
          return;
        }

        // 未達成任何動作：平滑彈回原位
        snapBack(tx, ty);
      } catch {
        onError();
        snapBack(tx, ty);
      } finally {
        lock.value = false;
        onDragCancel();
      }
    },
    [dispatchAction, gestureSettings.down, lock, onDragCancel, onDrop, onError, tx, ty],
  );

  // 單指滑動手勢（同時支援四向快速滑動分類與直接拖曳放入底部相簿晶片，完全不需長按）
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .activeOffsetY([-10, 10])
        .onStart(() => {
          runOnJS(onDragStart)();
        })
        .onUpdate((e) => {
          if (lock.value) return;
          tx.value = e.translationX;
          ty.value = e.translationY;
          runOnJS(onDragMove)({ x: e.absoluteX, y: e.absoluteY });
        })
        .onEnd((e) => {
          if (lock.value) return;
          const dx = e.translationX;
          const dy = e.translationY;
          const vx = e.velocityX ?? 0;
          const vy = e.velocityY ?? 0;
          const horizontal = Math.abs(dx) >= Math.abs(dy);

          // 1. 向上滑動：放入上滑目標相簿
          if (!horizontal && dy < 0 && (dy < UP_THRESHOLD || (vy < -900 && dy < -40))) {
            runOnJS(dispatchAction)(gestureSettings.up, 0, -FLY_DISTANCE);
            return;
          }
          // 2. 向右滑動：捨棄（移至垃圾桶）
          if (horizontal && dx > 0 && (dx > H_THRESHOLD || (vx > 900 && dx > 40))) {
            runOnJS(dispatchAction)(gestureSettings.right, FLY_DISTANCE, 0);
            return;
          }
          // 3. 向左滑動：略過
          if (horizontal && dx < 0 && (-dx > H_THRESHOLD || (vx < -900 && -dx > 40))) {
            runOnJS(dispatchAction)(gestureSettings.left, -FLY_DISTANCE, 0);
            return;
          }

          // 4. 下方拖曳 / 下滑：
          // 優先檢查是否放置在底部相簿晶片上！不需長按，直接拖曳放開即觸發放入相簿！
          lock.value = true;
          runOnJS(handleDropOrSwipeDown)({ x: e.absoluteX, y: e.absoluteY, dy, vy, horizontal });
        })
        .onFinalize(() => {
          if (!lock.value) {
            if (tx.value !== 0 || ty.value !== 0) snapBack(tx, ty);
            runOnJS(onDragCancel)();
          }
        }),
    [dispatchAction, gestureSettings, lock, tx, ty, handleDropOrSwipeDown, onDragStart, onDragMove, onDragCancel],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap().onEnd((_e, success) => {
        if (success) runOnJS(openSystemViewer)();
      }),
    [openSystemViewer],
  );

  const composed = useMemo(() => Gesture.Race(pan, tap), [pan, tap]);

  const cardStyle = useAnimatedStyle(() => {
    // 當卡片往下拖曳（ty.value > 0）時，卡片平滑縮小為精緻懸浮縮圖（scale 0.46），
    // 解決覆蓋底部相簿按鈕的問題，讓使用者能清楚看見下方 4 個相簿並準確對位！
    const dragScale = interpolate(ty.value, [0, 45, 180], [1, 0.88, 0.46], Extrapolation.CLAMP);
    const dragOpacity = interpolate(ty.value, [0, 180, 360], [1, 0.96, 0.88], Extrapolation.CLAMP);

    return {
      transform: [
        { translateX: tx.value },
        { translateY: ty.value },
        {
          rotate: `${interpolate(tx.value, [-320, 320], [-12, 12], Extrapolation.CLAMP)}deg`,
        },
        { scale: dragScale },
      ],
      opacity: dragOpacity,
    };
  });

  const upHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ty.value, [-85, -17], [1, 0], Extrapolation.CLAMP),
    borderWidth: ty.value <= -85 ? 2 : 0,
  }));
  const rightHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [18, 90], [0, 1], Extrapolation.CLAMP),
  }));
  const leftHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [-90, -18], [1, 0], Extrapolation.CLAMP),
  }));
  const downHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ty.value, [17, 85], [0, 1], Extrapolation.CLAMP),
    borderWidth: ty.value >= 85 ? 2 : 0,
  }));

  if (!item) {
    return (
      <View style={[styles.empty, { backgroundColor: bg }]}>
        <Text style={{ color: muted }}>沒有更多照片了</Text>
      </View>
    );
  }

  const aspect = item.width && item.height ? item.width / item.height : 1;
  const maxW = Math.max(1, area.width - 16);
  const maxH = Math.max(1, area.height - 16);
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }

  // 取得各方向文案
  const getActionCopy = (act: GestureAction) => {
    switch (act) {
      case 'album':
        return targetTitle ? targetTitle : '放入相簿 (請先選)';
      case 'trash':
        return '移至垃圾桶';
      case 'skip':
        return '略過此張';
      case 'inspect':
        // 下滑手勢已改為「分入下滑目標」，查看改走工具列 ⓘ 按鈕
        return downTargetTitle ? downTargetTitle : '下滑分類 (請先選)';
      case 'none':
        return '';
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms || ms <= 0) return '';
    const totalSecs = Math.round(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const pixelRatio = Math.min(PixelRatio.get(), 2);
  const sampleW = Math.max(1, Math.round(w * pixelRatio));
  const sampleH = Math.max(1, Math.round(h * pixelRatio));
  const isNativeFallback = stage === 'native-primary' || stage === 'native-fallback';

  const body = (
    <Animated.View style={[styles.card, { width: w, height: h }, cardStyle]}>
      {item.mediaType === 'video' ? (
        <VideoPreview uri={activeUri} width={w} height={h} controls={false} />
      ) : isNativeFallback ? (
        <RNImage
          key={`native-${item.assetId}:${activeUri}:${stage}`}
          source={{ uri: activeUri }}
          style={{ width: w, height: h, borderRadius: 12 }}
          resizeMode="contain"
          onError={handleLoadError}
        />
      ) : (
        <Image
          key={`expo-${item.assetId}:${activeUri}:${stage}`}
          source={{
            uri: activeUri,
            width: sampleW,
            height: sampleH,
          }}
          style={{ width: w, height: h, borderRadius: 12 }}
          contentFit="contain"
          priority="high"
          transition={0}
          recyclingKey={`${item.assetId}:${activeUri}:${stage}`}
          cachePolicy="memory-disk"
          onError={handleLoadError}
        />
      )}
      {item.mediaType === 'video' ? (
        <View style={styles.videoBadge}>
          <Text style={styles.videoBadgeText}>▶ 影片{item.duration ? ` ${formatDuration(item.duration)}` : ''}</Text>
        </View>
      ) : null}
    </Animated.View>
  );

  return (
    <View style={styles.wrap} onLayout={(event) => {
      const { width, height } = event.nativeEvent.layout;
      setArea((previous) => previous.width === width && previous.height === height ? previous : { width, height });
    }}>
      {/* 頂端統一手勢預覽提示條（不隨卡片移動，不會被手指擋住） */}
      {gestureSettings.up !== 'none' ? (
        <Animated.View style={[styles.unifiedTopHint, styles.upHintBanner, upHintStyle]} pointerEvents="none">
          <ArrowCircle direction="up" size={18} color="#fff" />
          <Text numberOfLines={1} style={styles.hintText}>{getActionCopy(gestureSettings.up)}</Text>
        </Animated.View>
      ) : null}

      {gestureSettings.right !== 'none' ? (
        <Animated.View
          style={[
            styles.unifiedTopHint,
            gestureSettings.right === 'trash' ? styles.trashHintBanner : styles.normalHintBanner,
            rightHintStyle,
          ]}
          pointerEvents="none">
          <Text numberOfLines={1} style={styles.hintText}>{getActionCopy(gestureSettings.right)}</Text>
          <ArrowCircle direction="right" size={18} color="#fff" />
        </Animated.View>
      ) : null}

      {gestureSettings.left !== 'none' ? (
        <Animated.View style={[styles.unifiedTopHint, styles.normalHintBanner, leftHintStyle]} pointerEvents="none">
          <ArrowCircle direction="left" size={18} color="#fff" />
          <Text numberOfLines={1} style={styles.hintText}>{getActionCopy(gestureSettings.left)}</Text>
        </Animated.View>
      ) : null}

      {highlightTitle ? (
        <View style={[styles.unifiedTopHint, styles.dropHighlightBanner]} pointerEvents="none">
          <ArrowCircle direction="down" size={18} color="#fff" />
          <Text numberOfLines={1} style={styles.hintText}>{`放入「${highlightTitle}」`}</Text>
        </View>
      ) : gestureSettings.down !== 'none' ? (
        <Animated.View style={[styles.unifiedTopHint, styles.normalHintBanner, downHintStyle]} pointerEvents="none">
          <ArrowCircle direction="down" size={18} color="#fff" />
          <Text numberOfLines={1} style={styles.hintText}>{getActionCopy(gestureSettings.down)}</Text>
        </Animated.View>
      ) : null}

      <GestureDetector gesture={composed}>
        <Animated.View style={styles.touchArea} collapsable={false}>
          {body}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function VideoPreview({ uri, width, height, controls }: { uri: string; width: number; height: number; controls: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={{ width, height, borderRadius: 12 }} contentFit="contain" nativeControls={controls} />;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  touchArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.001)',
  },
  card: { alignItems: 'center', justifyContent: 'center' },
  videoBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 5,
  },
  videoBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 280 },
  unifiedTopHint: {
    borderColor: '#fafaf9',
    maxWidth: '94%',
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  upHintBanner: {
    backgroundColor: 'rgba(28,25,23,0.92)',
  },
  normalHintBanner: {
    backgroundColor: 'rgba(41,37,36,0.92)',
  },
  trashHintBanner: {
    backgroundColor: 'rgba(220,38,38,0.92)',
  },
  dropHighlightBanner: {
    backgroundColor: 'rgba(22,139,255,0.95)',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  hintText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
