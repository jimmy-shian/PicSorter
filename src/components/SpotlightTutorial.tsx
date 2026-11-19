import { useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { ArrowCircle } from '@/components/GestureIcons';
import { useTranslation } from '@/hooks/useTranslation';

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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);

  const steps: Step[] = [
    {
      badge: t('tutorial.step1Badge'),
      title: t('tutorial.step1Title'),
      desc: t('tutorial.step1Desc'),
      renderIllustration: (tc, mc, cbg) => (
        <View style={styles.gestureGrid}>
          <View style={styles.gridTop}>
            <ArrowCircle direction="up" size={24} color={tc} />
            <Text style={[styles.gridLabel, { color: tc }]}>{t('tutorial.illuUpLabel')}</Text>
          </View>
          <View style={styles.gridMid}>
            <View style={styles.gridMidItem}>
              <ArrowCircle direction="left" size={24} color={mc} />
              <Text style={[styles.gridLabel, { color: mc }]}>{t('tutorial.illuLeftLabel')}</Text>
            </View>
            <View style={[styles.gridCard, { backgroundColor: cbg, borderColor: tc }]}>
              <Text style={[styles.gridCardText, { color: tc }]}>{t('tutorial.illuCardLabel')}</Text>
            </View>
            <View style={styles.gridMidItem}>
              <ArrowCircle direction="right" size={24} color="#DC2626" />
              <Text style={[styles.gridLabel, { color: '#DC2626' }]}>{t('tutorial.illuRightLabel')}</Text>
            </View>
          </View>
          <View style={styles.gridBottom}>
            <ArrowCircle direction="down" size={24} color={mc} />
            <Text style={[styles.gridLabel, { color: mc }]}>{t('tutorial.illuDownLabel')}</Text>
          </View>
        </View>
      ),
    },
    {
      badge: t('tutorial.step2Badge'),
      title: t('tutorial.step2Title'),
      desc: t('tutorial.step2Desc'),
      renderIllustration: (tc) => (
        <View style={styles.zoomIllu}>
          <Text style={[styles.zoomPinchText, { color: tc }]}>{t('tutorial.illuTapLabel')}</Text>
          <Text style={[styles.zoomSubText, { color: muted }]}>{t('tutorial.illuZoomSub')}</Text>
        </View>
      ),
    },
    {
      badge: t('tutorial.step3Badge'),
      title: t('tutorial.step3Title'),
      desc: t('tutorial.step3Desc'),
    },
    {
      badge: t('tutorial.step4Badge'),
      title: t('tutorial.step4Title'),
      desc: t('tutorial.step4Desc'),
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

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={handleSkip}>
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
              <Text style={[styles.skipText, { color: muted }]}>{t('tutorial.skipTutorial')}</Text>
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
              <Text style={[styles.nextText, { color: bg }]}>{isLast ? t('tutorial.buttonStart') : t('tutorial.buttonNext')}</Text>
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
    backgroundColor: 'rgba(0,0,0,0.88)',
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
