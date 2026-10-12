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
import type { ClassifyItem } from '@/types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/** 觸發門檻（px）：需大於手指誤觸，又不至於拖很遠 */
const UP_THRESHOLD = -90;
const TRASH_THRESHOLD = 95;
const DROP_THRESHOLD = 110;
/** 下拖超過此距離即進入「選擇目標」狀態，底部相簿顯示可放入提示 */
const DROP_ARM = 45;
const FLY_DISTANCE = 640;

export interface DragPoint {
  x: number;
  y: number;
}

interface Props {
  item: ClassifyItem | null;
  /** 目前選定的上滑目標名稱（顯示於上滑提示） */
  targetTitle: string | null;
  canSwipeUp: boolean;
  /** 父層以 highlightShared 同步目前手指下方的目標，worklet 在放開瞬間同步讀取 */
  highlightShared: SharedValue<string | null>;
  onSwipeUp: () => void;
  onTrash: () => void;
  onDropToAlbum: (targetId: string) => void;
  onDropDragStart: () => void;
  onDropDragMove: (p: DragPoint) => void;
  onDropDragEnd: () => void;
  /** 上滑但未選擇目標時：回彈 + 提示，而非分類 */
  onNeedTarget: () => void;
}

function snapBack(tx: SharedValue<number>, ty: SharedValue<number>) {
  'worklet';
  tx.value = withSpring(0, { damping: 18, stiffness: 220 });
  ty.value = withSpring(0, { damping: 18, stiffness: 220 });
}

/**
 * 中央照片卡（P2）：單張、原始比例不裁切、輕觸放大。
 * 上滑＝放入選定相簿；左右滑＝待刪除；下拖＝拖到指定相簿放開。
 * 放開未達門檻一律彈回原位，不執行分類。
 */
export function ClassifyPhoto({
  item,
  targetTitle,
  canSwipeUp,
  highlightShared,
  onSwipeUp,
  onTrash,
  onDropToAlbum,
  onDropDragStart,
  onDropDragMove,
  onDropDragEnd,
  onNeedTarget,
}: Props) {
  const { bg, muted } = useTheme();
  const [zoom, setZoom] = useState(false);

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const lock = useSharedValue(false);
  const dropActive = useSharedValue(false);
  const lastSentX = useSharedValue(0);
  const lastSentY = useSharedValue(0);

  const openZoom = useMemo(() => () => setZoom(true), []);

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
          if (ty.value > DROP_ARM) {
            if (!dropActive.value) {
              dropActive.value = true;
              lastSentX.value = e.absoluteX;
              lastSentY.value = e.absoluteY;
              runOnJS(onDropDragStart)();
              runOnJS(onDropDragMove)({ x: e.absoluteX, y: e.absoluteY });
            } else {
              const dx = e.absoluteX - lastSentX.value;
              const dy = e.absoluteY - lastSentY.value;
              // 節流：移動超過 10px 才回傳 JS 做命中判斷，避免每幀過橋
              if (dx * dx + dy * dy > 100) {
                lastSentX.value = e.absoluteX;
                lastSentY.value = e.absoluteY;
                runOnJS(onDropDragMove)({ x: e.absoluteX, y: e.absoluteY });
              }
            }
          } else if (dropActive.value) {
            dropActive.value = false;
            runOnJS(onDropDragEnd)();
          }
        })
        .onEnd((e) => {
          if (lock.value) return;
          const dx = e.translationX;
          const dy = e.translationY;
          const vx = e.velocityX ?? 0;
          const vy = e.velocityY ?? 0;
          const horizontal = Math.abs(dx) >= Math.abs(dy);
          const clearDrop = () => {
            if (dropActive.value) {
              dropActive.value = false;
              runOnJS(onDropDragEnd)();
            }
          };

          // 上滑：放入選定相簿
          if (!horizontal && dy < 0 && (dy < UP_THRESHOLD || (vy < -900 && dy < -40))) {
            if (!canSwipeUp) {
              snapBack(tx, ty);
              clearDrop();
              runOnJS(onNeedTarget)();
              return;
            }
            lock.value = true;
            clearDrop();
            tx.value = withTiming(0, { duration: 200 });
            ty.value = withTiming(-FLY_DISTANCE, { duration: 220 }, (done) => {
              if (done) runOnJS(onSwipeUp)();
            });
            return;
          }
          // 左右滑：捨棄（同功能）
          if (horizontal && (Math.abs(dx) > TRASH_THRESHOLD || (Math.abs(vx) > 900 && Math.abs(dx) > 40))) {
            lock.value = true;
            clearDrop();
            const dir = dx >= 0 ? 1 : -1;
            tx.value = withTiming(dir * FLY_DISTANCE, { duration: 220 }, (done) => {
              if (done) runOnJS(onTrash)();
            });
            ty.value = withTiming(0, { duration: 220 });
            return;
          }
          // 下拖：必須落在某個目標相簿上才成立
          if (!horizontal && dy > 0 && dy > DROP_THRESHOLD) {
            const target = highlightShared.value;
            if (target) {
              lock.value = true;
              clearDrop();
              tx.value = withTiming(0, { duration: 180 });
              ty.value = withTiming(FLY_DISTANCE, { duration: 220 }, (done) => {
                if (done) runOnJS(onDropToAlbum)(target);
              });
              return;
            }
          }
          // 未達門檻：回彈，不分類
          snapBack(tx, ty);
          clearDrop();
        })
        .onFinalize(() => {
          // 手勢被中斷（如中途重建）時保證回彈，不留下偏移殘影
          if (!lock.value && (tx.value !== 0 || ty.value !== 0)) {
            snapBack(tx, ty);
            if (dropActive.value) {
              dropActive.value = false;
              runOnJS(onDropDragEnd)();
            }
          }
        }),
    [
      canSwipeUp,
      highlightShared,
      lock,
      dropActive,
      lastSentX,
      lastSentY,
      tx,
      ty,
      onDropDragEnd,
      onDropDragMove,
      onDropDragStart,
      onDropToAlbum,
      onNeedTarget,
      onSwipeUp,
      onTrash,
    ],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap().onEnd((_e, success) => {
        if (success) runOnJS(openZoom)();
      }),
    [openZoom],
  );

  const composed = useMemo(() => Gesture.Exclusive(pan, tap), [pan, tap]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      {
        rotate: `${interpolate(tx.value, [-320, 320], [-14, 14], Extrapolation.CLAMP)}deg`,
      },
      {
        scale: interpolate(ty.value, [DROP_ARM, 260], [1, 0.94], Extrapolation.CLAMP),
      },
    ],
  }));

  const upHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ty.value, [-130, -45], [1, 0], Extrapolation.CLAMP),
  }));
  const trashHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(tx.value), [45, 110], [0, 1], Extrapolation.CLAMP),
  }));
  const dropHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ty.value, [DROP_ARM, 95], [0, 1], Extrapolation.CLAMP),
  }));

  if (!item) {
    return (
      <View style={[styles.empty, { backgroundColor: bg }]}>
        <Text style={{ color: muted }}>沒有更多照片了</Text>
      </View>
    );
  }

  const aspect = item.width && item.height ? item.width / item.height : 1;
  const maxW = SCREEN_W - 24;
  const maxH = SCREEN_H * 0.52;
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }

  const body = (
    <Animated.View style={[styles.card, cardStyle]}>
      <Image source={{ uri: item.uri }} style={{ width: w, height: h, borderRadius: 10 }} contentFit="contain" />
      {/* 上滑提示 */}
      <Animated.View style={[styles.hintBubble, styles.upBubble, upHintStyle]} pointerEvents="none">
        <Text style={styles.hintText}>↑ {targetTitle ? `放入「${targetTitle}」` : '請先選擇目標相簿'}</Text>
      </Animated.View>
      {/* 左右捨棄提示 */}
      <Animated.View style={[styles.hintBubble, styles.trashBubble, trashHintStyle]} pointerEvents="none">
        <Text style={styles.hintText}>捨棄</Text>
      </Animated.View>
      {/* 下拖提示 */}
      <Animated.View style={[styles.hintBubble, styles.dropBubble, dropHintStyle]} pointerEvents="none">
        <Text style={styles.hintText}>拖到下方相簿放開</Text>
      </Animated.View>
    </Animated.View>
  );

  return (
    <View style={styles.wrap}>
      {zoom ? (
        body
      ) : (
        <GestureDetector gesture={composed}>{body}</GestureDetector>
      )}
      <Text style={[styles.caption, { color: muted }]}>輕觸放大 · 上滑分類 · 左右滑捨棄 · 下拖指定相簿</Text>
      <Modal visible={zoom} animationType="fade" onRequestClose={() => setZoom(false)}>
        <View style={styles.zoomBg}>
          <Pressable style={styles.zoomClose} onPress={() => setZoom(false)}>
            <Text style={styles.zoomCloseText}>✕ 關閉</Text>
          </Pressable>
          {/* 放大檢視時不掛手勢：分類手勢暫停，避免誤觸 */}
          <Image source={{ uri: item.uri }} style={{ width: SCREEN_W, height: SCREEN_H * 0.8 }} contentFit="contain" />
          <Text style={[styles.caption, { color: '#A8A29E' }]}>放大檢視中（分類手勢已暫停）</Text>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  card: { alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 },
  caption: { fontSize: 11, marginTop: 8 },
  hintBubble: {
    position: 'absolute',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  upBubble: { top: 12, backgroundColor: 'rgba(28,25,23,0.85)' },
  trashBubble: { top: '44%', backgroundColor: 'rgba(220,38,38,0.88)' },
  dropBubble: { bottom: 12, backgroundColor: 'rgba(28,25,23,0.85)' },
  hintText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  zoomBg: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  zoomClose: { position: 'absolute', top: 48, right: 20, zIndex: 1, padding: 10 },
  zoomCloseText: { color: '#fff', fontSize: 15 },
});
