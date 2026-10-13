import { useMemo, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
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
import type { ClassifyItem, GestureAction, GestureDirection, GestureSettings } from '@/types';
import { ArrowCircle } from '@/components/GestureIcons';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

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
  onNeedTarget,
}: Props) {
  const { bg, muted } = useTheme();
  const [zoom, setZoom] = useState(false);

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const lock = useSharedValue(false);

  const openZoom = useMemo(() => () => setZoom(true), []);

  const handleRight = useMemo(() => {
    if (onSwipeRight) return onSwipeRight;
    if (onTrash) return onTrash;
    return () => {};
  }, [onSwipeRight, onTrash]);

  // 根據自訂方向手勢分發動作
  const dispatchAction = useMemo(() => {
    return (
      action: GestureAction,
      flyX: number,
      flyY: number,
      onComplete?: () => void,
    ) => {
      if (action === 'none') {
        snapBack(tx, ty);
        return;
      }
      if (action === 'album') {
        if (!canSwipeUp) {
          snapBack(tx, ty);
          onNeedTarget();
          return;
        }
        lock.value = true;
        tx.value = withTiming(flyX, { duration: 220 });
        ty.value = withTiming(flyY, { duration: 220 }, (done) => {
          if (done) runOnJS(onSwipeUp)();
        });
        return;
      }
      if (action === 'trash') {
        lock.value = true;
        tx.value = withTiming(flyX, { duration: 220 });
        ty.value = withTiming(flyY, { duration: 220 }, (done) => {
          if (done) runOnJS(handleRight)();
        });
        return;
      }
      if (action === 'skip') {
        lock.value = true;
        tx.value = withTiming(flyX, { duration: 220 });
        ty.value = withTiming(flyY, { duration: 220 }, (done) => {
          if (done) {
            if (onSwipeLeft) runOnJS(onSwipeLeft)();
            else runOnJS(handleRight)();
          }
        });
        return;
      }
      if (action === 'inspect') {
        snapBack(tx, ty);
        if (onSwipeDown) onSwipeDown();
        return;
      }
      snapBack(tx, ty);
    };
  }, [canSwipeUp, handleRight, lock, onNeedTarget, onSwipeDown, onSwipeLeft, onSwipeUp, tx, ty]);

  // 單指滑動手勢
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .activeOffsetY([-12, 12])
        .onBegin(() => {
          lock.value = false;
        })
        .onUpdate((e) => {
          if (lock.value) return;
          tx.value = e.translationX;
          ty.value = e.translationY;
        })
        .onEnd((e) => {
          if (lock.value) return;
          const dx = e.translationX;
          const dy = e.translationY;
          const vx = e.velocityX ?? 0;
          const vy = e.velocityY ?? 0;
          const horizontal = Math.abs(dx) >= Math.abs(dy);

          // 向上
          if (!horizontal && dy < 0 && (dy < UP_THRESHOLD || (vy < -900 && dy < -40))) {
            runOnJS(dispatchAction)(gestureSettings.up, 0, -FLY_DISTANCE);
            return;
          }
          // 向下
          if (!horizontal && dy > 0 && (dy > DOWN_THRESHOLD || (vy > 900 && dy > 40))) {
            runOnJS(dispatchAction)(gestureSettings.down, 0, FLY_DISTANCE);
            return;
          }
          // 向右
          if (horizontal && dx > 0 && (dx > H_THRESHOLD || (vx > 900 && dx > 40))) {
            runOnJS(dispatchAction)(gestureSettings.right, FLY_DISTANCE, 0);
            return;
          }
          // 向左
          if (horizontal && dx < 0 && (-dx > H_THRESHOLD || (vx < -900 && -dx > 40))) {
            runOnJS(dispatchAction)(gestureSettings.left, -FLY_DISTANCE, 0);
            return;
          }
          snapBack(tx, ty);
        })
        .onFinalize(() => {
          if (!lock.value && (tx.value !== 0 || ty.value !== 0)) {
            snapBack(tx, ty);
          }
        }),
    [dispatchAction, gestureSettings, lock, tx, ty],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap().onEnd((_e, success) => {
        if (success) runOnJS(openZoom)();
      }),
    [openZoom],
  );

  const composed = useMemo(
    () => Gesture.Exclusive(pan, tap),
    [pan, tap],
  );

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      {
        rotate: `${interpolate(tx.value, [-320, 320], [-12, 12], Extrapolation.CLAMP)}deg`,
      },
    ],
  }));

  const upHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ty.value, [-120, -40], [1, 0], Extrapolation.CLAMP),
  }));
  const rightHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [40, 100], [0, 1], Extrapolation.CLAMP),
  }));
  const leftHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [-100, -40], [1, 0], Extrapolation.CLAMP),
  }));
  const downHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ty.value, [40, 90], [0, 1], Extrapolation.CLAMP),
  }));

  if (!item) {
    return (
      <View style={[styles.empty, { backgroundColor: bg }]}>
        <Text style={{ color: muted }}>沒有更多照片了</Text>
      </View>
    );
  }

  const aspect = item.width && item.height ? item.width / item.height : 1;
  const maxW = SCREEN_W - 20;
  const maxH = SCREEN_H * 0.52; // 放寬高度，避免遮擋
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }

  // 取得各方向文案
  const getActionCopy = (act: GestureAction, dir: GestureDirection) => {
    switch (act) {
      case 'album':
        return targetTitle ? `放入「${targetTitle}」` : '放入相簿 (請先選)';
      case 'trash':
        return '移至垃圾桶';
      case 'skip':
        return '略過此張';
      case 'inspect':
        // 下滑手勢已改為「分入下滑目標」，查看改走工具列 ⓘ 按鈕
        return downTargetTitle ? `放入「${downTargetTitle}」` : '下滑分類 (請先選)';
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

  const body = (
    <Animated.View style={[styles.card, cardStyle]}>
      <Image
        source={{ uri: item.uri }}
        style={{ width: w, height: h, borderRadius: 12 }}
        contentFit="contain"
        recyclingKey={item.assetId}
        cachePolicy="memory-disk"
      />
      {item.mediaType === 'video' ? (
        <View style={styles.videoBadge}>
          <Text style={styles.videoBadgeText}>▶ 影片{item.duration ? ` ${formatDuration(item.duration)}` : ''}</Text>
        </View>
      ) : null}
    </Animated.View>
  );

  return (
    <View style={styles.wrap}>
      {/* 頂端統一手勢預覽提示條（不隨卡片移動，不會被手指擋住） */}
      {gestureSettings.up !== 'none' ? (
        <Animated.View style={[styles.unifiedTopHint, styles.upHintBanner, upHintStyle]} pointerEvents="none">
          <ArrowCircle direction="up" size={18} color="#fff" />
          <Text style={styles.hintText}>{getActionCopy(gestureSettings.up, 'up')}</Text>
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
          <Text style={styles.hintText}>{getActionCopy(gestureSettings.right, 'right')}</Text>
          <ArrowCircle direction="right" size={18} color="#fff" />
        </Animated.View>
      ) : null}

      {gestureSettings.left !== 'none' ? (
        <Animated.View style={[styles.unifiedTopHint, styles.normalHintBanner, leftHintStyle]} pointerEvents="none">
          <ArrowCircle direction="left" size={18} color="#fff" />
          <Text style={styles.hintText}>{getActionCopy(gestureSettings.left, 'left')}</Text>
        </Animated.View>
      ) : null}

      {gestureSettings.down !== 'none' ? (
        <Animated.View style={[styles.unifiedTopHint, styles.normalHintBanner, downHintStyle]} pointerEvents="none">
          <ArrowCircle direction="down" size={18} color="#fff" />
          <Text style={styles.hintText}>{getActionCopy(gestureSettings.down, 'down')}</Text>
        </Animated.View>
      ) : null}

      {zoom ? (
        <View style={styles.touchArea}>{body}</View>
      ) : (
        <GestureDetector gesture={composed}>
          <Animated.View style={styles.touchArea} collapsable={false}>
            {body}
          </Animated.View>
        </GestureDetector>
      )}

      <Modal visible={zoom} animationType="fade" onRequestClose={() => setZoom(false)}>
        <View style={styles.zoomBg}>
          <Pressable style={styles.zoomClose} onPress={() => setZoom(false)} hitSlop={12}>
            <Text style={styles.zoomCloseText}>✕ 關閉</Text>
          </Pressable>
          <ZoomViewer key={item.uri} uri={item.uri} onClose={() => setZoom(false)} />
          <Text style={[styles.caption, { color: '#A8A29E' }]}>雙指縮放細看 · 雙擊切換 · 1 倍下滑關閉</Text>
        </View>
      </Modal>
    </View>
  );
}

/**
 * 原生風格檢視縮放：
 * 1. 雙指以手指為中心 1~4 倍，放手停在那，不彈回 1。
 * 2. 放大後單指才能拖曳；1 倍時下滑關閉。
 * 3. 雙擊在 1 倍和 2.5 倍之間切換。
 */
function ZoomViewer({ uri, onClose }: { uri: string; onClose: () => void }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart((e) => {
          'worklet';
          focalX.value = e.focalX - SCREEN_W / 2;
          focalY.value = e.focalY - SCREEN_H / 2;
        })
        .onUpdate((e) => {
          'worklet';
          const next = savedScale.value * e.scale;
          scale.value = Math.min(4, Math.max(1, next));
        })
        .onEnd(() => {
          'worklet';
          savedScale.value = scale.value;
          if (scale.value <= 1.01) {
            scale.value = 1;
            savedScale.value = 1;
            tx.value = withSpring(0);
            ty.value = withSpring(0);
            savedTx.value = 0;
            savedTy.value = 0;
          }
        }),
    [focalX, focalY, scale, savedScale, tx, ty, savedTx, savedTy],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .averageTouches(true)
        .onUpdate((e) => {
          'worklet';
          if (scale.value <= 1.02) {
            // 1 倍時允許單指向下滑動關閉檢視
            if (e.translationY > 0) {
              ty.value = e.translationY;
            }
            return;
          }
          const limitX = Math.max(0, (SCREEN_W * (scale.value - 1)) / 2 + 30);
          const limitY = Math.max(0, (SCREEN_H * 0.78 * (scale.value - 1)) / 2 + 30);
          const nx = savedTx.value + e.translationX;
          const ny = savedTy.value + e.translationY;
          tx.value = Math.min(limitX, Math.max(-limitX, nx));
          ty.value = Math.min(limitY, Math.max(-limitY, ny));
        })
        .onEnd((e) => {
          'worklet';
          if (scale.value <= 1.02) {
            if (e.translationY > 100 || (e.velocityY && e.velocityY > 800)) {
              runOnJS(onClose)();
            } else {
              ty.value = withSpring(0);
            }
            return;
          }
          savedTx.value = tx.value;
          savedTy.value = ty.value;
        }),
    [onClose, scale, tx, ty, savedTx, savedTy],
  );

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
          'worklet';
          if (scale.value > 1.3) {
            scale.value = withSpring(1);
            savedScale.value = 1;
            tx.value = withSpring(0);
            ty.value = withSpring(0);
            savedTx.value = 0;
            savedTy.value = 0;
          } else {
            scale.value = withSpring(2.5);
            savedScale.value = 2.5;
          }
        }),
    [scale, savedScale, tx, ty, savedTx, savedTy],
  );

  const composed = useMemo(
    () => Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan)),
    [pinch, pan, doubleTap],
  );

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.zoomCanvas, zoomStyle]}>
        <Image
          source={{ uri }}
          style={{ width: SCREEN_W, height: SCREEN_H * 0.78 }}
          contentFit="contain"
          cachePolicy="memory-disk"
          recyclingKey={uri}
        />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  touchArea: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
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
  caption: { fontSize: 11, marginTop: 6, textAlign: 'center', paddingHorizontal: 16 },
  unifiedTopHint: {
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
  hintText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  zoomBg: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  zoomClose: { position: 'absolute', top: 48, right: 20, zIndex: 1, padding: 10 },
  zoomCloseText: { color: '#fff', fontSize: 15 },
  zoomCanvas: { alignItems: 'center', justifyContent: 'center' },
});
