import { useAdBypass } from '../lib/ad-bypass';
import { useTheme } from '../lib/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { AdErrorBoundary } from './AdErrorBoundary';
import { ArrowCircle } from './GestureIcons';
import { NativeAdCard } from './NativeAdCard';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { useNativeAd } from 'react-native-google-mobile-ads';
import adConfig from '../../admob-config.json';

interface MilestoneAdModalProps {
  visible: boolean;
  sortedCount: number;
  onClose: () => void;
}

/** 統一倒數長度（秒） */
const AD_DURATION = 5;
/** 後門略過：5 秒內累計 5 次點擊 */
const BACKDOOR_WINDOW = 5000;
const BACKDOOR_CLICKS = 5;

export function MilestoneAdModal(props: MilestoneAdModalProps) {
  const [cycle, setCycle] = useState(0);
  const onCloseProp = props.onClose;

  const handleClose = useCallback(() => {
    onCloseProp();
    setCycle((c) => c + 1);
  }, [onCloseProp]);

  return (
    <AdErrorBoundary key={cycle} onError={handleClose}>
      <MilestoneAdContent {...props} onClose={handleClose} />
    </AdErrorBoundary>
  );
}

/**
 * 里程碑廣告：使用 AdMob「原生進階 (Native Advanced)」廣告單元。
 *
 * 原生廣告是「渲染在我們自己的版位裡」，不是全螢幕蓋版，
 * 所以視覺完全沿用 ClassifyPhoto 的照片卡＋手勢膠囊語言：
 * 廣告素材（媒體／標題／內文／CTA）就是那張「照片」的內容。
 *
 * 注意：AdMob 的廣告單元類型必須與 API 一致 ——
 * 原生進階單元只能用 NativeAd 請求，用 InterstitialAd 請求會一直 no-fill。
 */
function MilestoneAdContent({ visible, sortedCount, onClose }: MilestoneAdModalProps) {
  const { bypassed, ready, enableBypass } = useAdBypass();
  const { dark, bg, card, text, muted, accent, border } = useTheme();
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState(AD_DURATION);
  const [loadWaitTimedOut, setLoadWaitTimedOut] = useState(false);
  const clickTimestampsRef = useRef<number[]>([]);
  const closedRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const closeOnce = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onCloseRef.current();
  }, []);

  const milestoneAdUnitId = adConfig.units.milestone;
  const hasNativeUnit = typeof milestoneAdUnitId === 'string' && milestoneAdUnitId.startsWith('ca-app-pub-');

  const { status, nativeAd } = useNativeAd({
    adUnitId: hasNativeUnit ? (milestoneAdUnitId as string) : null,
    autoLoad: ready && !bypassed,
  });

  // 後門略過：5 秒內累計 5 次點擊
  const handleBackdoorTap = async () => {
    const now = Date.now();
    const recent = [...clickTimestampsRef.current.filter((t) => now - t <= BACKDOOR_WINDOW), now];
    clickTimestampsRef.current = recent;

    if (recent.length >= BACKDOOR_CLICKS) {
      try {
        await enableBypass();
      } catch (error) {
        console.warn('Failed to persist ad bypass preference:', error);
      } finally {
        closeOnce();
      }
    }
  };

  useEffect(() => {
    if (!ready || !visible || bypassed || status !== 'loading') return;
    const timer = setTimeout(() => setLoadWaitTimedOut(true), 3000);
    return () => clearTimeout(timer);
  }, [ready, visible, bypassed, status]);

  const canStartCountdown = ready && visible && !bypassed && (status !== 'loading' || loadWaitTimedOut);

  useEffect(() => {
    if (!ready) return;
    if (!visible || bypassed) {
      if (bypassed && visible) closeOnce();
      return;
    }
    if (!canStartCountdown) return;

    let active = true;
    let remaining = AD_DURATION;
    const timer = setInterval(() => {
      remaining -= 1;
      if (active) {
        setCountdown(Math.max(0, remaining));
      }
      if (remaining <= 0) {
        clearInterval(timer);
        // 原生廣告渲染在版位內，倒數結束直接關閉；沒回填（no-fill）也一樣關閉
        if (active) closeOnce();
      }
    }, 1000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [visible, closeOnce, ready, bypassed, canStartCountdown]);

  if (!visible || bypassed) return null;

  const showNative = status === 'loaded' && nativeAd !== null;

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={[styles.overlay, { backgroundColor: dark ? 'rgba(0,0,0,0.78)' : 'rgba(28,25,23,0.42)' }]}>
        <View style={[styles.dialog, { backgroundColor: card, borderColor: border }]}>
          {/* 頂列：里程碑 + 倒數膠囊 */}
          <View style={styles.topBar}>
            <Pressable
              onPress={handleBackdoorTap}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.brandRow}
            >
              <View style={[styles.checkBadge, { backgroundColor: bg, borderColor: border }]}>
                <Text style={[styles.checkText, { color: accent }]}>✓</Text>
              </View>
              <View style={styles.brandText}>
                <Text style={[styles.appTitle, { color: text }]}>{t('milestoneAd.title')}</Text>
                <Text style={[styles.appMeta, { color: muted }]}>{t('milestoneAd.countLine', { count: sortedCount })}</Text>
              </View>
            </Pressable>
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>{countdown}s</Text>
            </View>
          </View>

          {/* 進度條 */}
          <View style={[styles.progressTrack, { backgroundColor: border }]}>
            <View style={[styles.progressFill, { backgroundColor: accent, width: `${(countdown / AD_DURATION) * 100}%` }]} />
          </View>

          {/* 原生進階廣告：素材渲染在「照片本體」位置 */}
          {showNative && nativeAd ? (
            <NativeAdCard nativeAd={nativeAd} mediaHeight={220} onCtaPress={handleBackdoorTap} />
          ) : (
            <Pressable
              onPress={handleBackdoorTap}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={[styles.photoArea, { backgroundColor: bg, borderColor: border }]}
            >
              <View style={[styles.placeholder, { borderColor: border, backgroundColor: card }]}>
                <View style={[styles.placeholderBar, { backgroundColor: accent }]} />
                <Text style={[styles.placeholderText, { color: muted }]}>
                  {status === 'loading' ? t('ad.loading') : t('ad.label')}
                </Text>
              </View>
            </Pressable>
          )}

          {/* 手勢膠囊提示（= ClassifyPhoto 語言） */}
          <View style={styles.pillRow}>
            <View style={styles.hintPill}>
              <ArrowCircle direction="left" size={16} color="#fff" />
              <Text numberOfLines={1} style={styles.hintText}>{t('common.skip')}</Text>
            </View>
            <View style={[styles.hintPill, styles.hintTrash]}>
              <Text numberOfLines={1} style={styles.hintText}>{t('common.discard')}</Text>
              <ArrowCircle direction="right" size={16} color="#fff" />
            </View>
          </View>

          {/* 底列 */}
          <View style={[styles.footer, { borderTopColor: border }]}>
            <Text style={[styles.footerInfo, { color: muted }]}>{t('milestoneAd.googleSponsor')}</Text>
            <Text style={[styles.footerInfo, { color: muted }]}>yesolve studio</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  brandText: {
    flexShrink: 1,
  },
  checkBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    fontSize: 17,
    fontWeight: '700',
  },
  appTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  appMeta: {
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 1,
  },
  countPill: {
    backgroundColor: 'rgba(28,25,23,0.92)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  countPillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  progressTrack: {
    height: 3,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  photoArea: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  placeholder: {
    width: '100%',
    minHeight: 220,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  placeholderBar: {
    width: 110,
    height: 3,
    borderRadius: 999,
    opacity: 0.65,
  },
  placeholderText: {
    fontSize: 10,
    fontFamily: 'monospace',
    letterSpacing: 1.2,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  hintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: 'rgba(41,37,36,0.92)',
  },
  hintTrash: {
    backgroundColor: 'rgba(220,38,38,0.92)',
  },
  hintText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  footerInfo: {
    fontSize: 10,
  },
});
