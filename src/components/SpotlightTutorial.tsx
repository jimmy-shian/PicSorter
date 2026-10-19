import { useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { ArrowCircle } from '@/components/GestureIcons';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const { height: SCREEN_H } = Dimensions.get('window');

interface Step {
  title: string;
  badge: string;
  desc: string;
  renderIllustration?: (textColor: string, mutedColor: string, cardBg: string) => React.ReactNode;
}

export function SpotlightTutorial({ visible, onClose }: Props) {
  const { bg, text, muted, border, card } = useTheme();
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);

  const steps: Step[] = [
    {
      badge: '手勢整理',
      title: '四向滑動，直覺分類',
      desc: '• 向上滑：放入上滑目標相簿\n• 向右滑：標記為待刪除\n• 向左滑：略過不處理\n• 向下滑：放入下滑目標相簿（額外分類）\n\n點「上滑」目標列可設定上下滑相簿。下滑目標會在底部四個文字選項中高亮，點選選項可直接分類。長按照片 200ms 後拖曳，可放入任意顯示中的相簿；想看照片在系統哪些相簿，點工具列 ⓘ「查看」。\n\n可在「設定」中自訂方向動作、互換或設為無動作！',
      renderIllustration: (tc, mc, cbg) => (
        <View style={styles.gestureGrid}>
          <View style={styles.gridTop}>
            <ArrowCircle direction="up" size={24} color={tc} />
            <Text style={[styles.gridLabel, { color: tc }]}>上滑：目標相簿</Text>
          </View>
          <View style={styles.gridMid}>
            <View style={styles.gridMidItem}>
              <ArrowCircle direction="left" size={24} color={mc} />
              <Text style={[styles.gridLabel, { color: mc }]}>左滑：略過</Text>
            </View>
            <View style={[styles.gridCard, { backgroundColor: cbg, borderColor: tc }]}>
              <Text style={[styles.gridCardText, { color: tc }]}>照片卡片</Text>
            </View>
            <View style={styles.gridMidItem}>
              <ArrowCircle direction="right" size={24} color="#DC2626" />
              <Text style={[styles.gridLabel, { color: '#DC2626' }]}>右滑：捨棄</Text>
            </View>
          </View>
          <View style={styles.gridBottom}>
            <ArrowCircle direction="down" size={24} color={mc} />
            <Text style={[styles.gridLabel, { color: mc }]}>下滑：額外分類</Text>
          </View>
        </View>
      ),
    },
    {
      badge: '細看照片',
      title: '輕觸開內建相片檢視',
      desc: '主卡保持滑動手感，不吃雙指手勢。想細看時輕觸照片，直接開啟手機內建的相片檢視，放大、雙擊、滑動瀏覽都由系統原生處理，返回 App 繼續分類。',
      renderIllustration: (tc) => (
        <View style={styles.zoomIllu}>
          <Text style={[styles.zoomPinchText, { color: tc }]}>👆 輕觸照片細看</Text>
          <Text style={[styles.zoomSubText, { color: muted }]}>開手機內建相片檢視 · 系統原生縮放</Text>
        </View>
      ),
    },
    {
      badge: '目標相簿',
      title: '極簡底部列與快捷按鈕',
      desc: '• 點「上滑」目標列的「編輯」，可在上滑／下滑分頁設定各自相簿。\n• 下滑目標以底部選項高亮表示。四個文字選項可點選分類，也可長按照片後拖曳放入。\n• 分類手勢頁的星號可設定最多 4 個快捷，勾選代表目前的手勢目標。管理頁可獨立調整快捷、排序、固定與顯示狀態。按「完成」儲存。',
    },
    {
      badge: '安全保障',
      title: '檢查結果後再套用',
      desc: '滑動過程只在手機本機記錄，不會立即移動或刪除系統相簿中的檔案。\n\n隨時點右上角「結束」查看整理結果，套用前可檢查結果，移入垃圾桶也可選擇不再顯示 App 確認。系統必要的授權仍會保留。',
    },
  ];

  const current = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  const handleNext = () => {
    if (isLast) {
      setStepIndex(0);
      onClose();
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  const handleSkip = () => {
    setStepIndex(0);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleSkip}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: bg,
              borderColor: border,
              maxHeight: SCREEN_H * 0.82,
              paddingBottom: Math.max(16, insets.bottom + 8),
            },
          ]}>
          <View style={styles.header}>
            <View style={[styles.badge, { backgroundColor: card, borderColor: border }]}>
              <Text style={[styles.badgeText, { color: text }]}>{current.badge}</Text>
            </View>
            <Pressable onPress={handleSkip} hitSlop={10}>
              <Text style={[styles.skipText, { color: muted }]}>略過教學</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}>
            <Text style={[styles.title, { color: text }]}>{current.title}</Text>

            {current.renderIllustration ? (
              <View style={[styles.illuBox, { backgroundColor: card, borderColor: border }]}>
                {current.renderIllustration(text, muted, card)}
              </View>
            ) : null}

            <Text style={[styles.desc, { color: muted }]}>{current.desc}</Text>
          </ScrollView>

          {/* 導覽指示點與下一步按鈕固定在底部 */}
          <View style={[styles.footerRow, { borderTopColor: border }]}>
            <View style={styles.dots}>
              {steps.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: i === stepIndex ? text : border,
                      width: i === stepIndex ? 18 : 6,
                    },
                  ]}
                />
              ))}
            </View>
            <Pressable style={[styles.nextBtn, { backgroundColor: text }]} onPress={handleNext}>
              <Text style={[styles.nextText, { color: bg }]}>{isLast ? '開始整理' : '下一步 ›'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  card: {
    borderWidth: 1.5,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  scrollBody: {
    flexGrow: 0,
  },
  scrollContent: {
    gap: 12,
    paddingVertical: 6,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  skipText: {
    fontSize: 13,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
  },
  desc: {
    fontSize: 14,
    lineHeight: 22,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 10,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  nextBtn: {
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  nextText: {
    fontSize: 14,
    fontWeight: '700',
  },
  gestureGrid: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  gridTop: {
    alignItems: 'center',
    gap: 3,
  },
  gridBottom: {
    alignItems: 'center',
    gap: 3,
  },
  gridMid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 4,
  },
  gridMidItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 3,
  },
  gridCard: {
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexShrink: 0,
  },
  gridCardText: {
    fontSize: 12,
    fontWeight: '700',
  },
  gridLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  illuBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  zoomIllu: {
    alignItems: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  zoomPinchText: {
    fontSize: 18,
    fontWeight: '700',
  },
  zoomSubText: {
    fontSize: 12,
  },
});
