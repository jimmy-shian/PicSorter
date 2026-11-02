import { useAdBypass } from '../lib/ad-bypass';
import { useTheme } from '../lib/theme';
import { ArrowCircle } from './GestureIcons';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Image } from 'react-native';
import {
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
  useNativeAd,
} from 'react-native-google-mobile-ads';
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
  return props.visible ? <MilestoneAdContent key={props.sortedCount} {...props} /> : null;
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
  const [countdown, setCountdown] = useState(AD_DURATION);
  const clickTimestampsRef = useRef<number[]>([]);

  const milestoneAdUnitId = adConfig.units.milestone;
  const hasNativeUnit = typeof milestoneAdUnitId === 'string' && milestoneAdUnitId.startsWith('ca-app-pub-');

  const { status, nativeAd } = useNativeAd({
    adUnitId: hasNativeUnit ? (milestoneAdUnitId as string) : null,
    autoLoad: ready && !bypassed && visible,
  });

  // 後門略過：5 秒內累計 5 次點擊
  const handleBackdoorTap = async () => {
    const now = Date.now();
    const recent = [...clickTimestampsRef.current.filter((t) => now - t <= BACKDOOR_WINDOW), now];
    clickTimestampsRef.current = recent;

    if (recent.length >= BACKDOOR_CLICKS) {
      await enableBypass();
      onClose();
    }
  };

  useEffect(() => {
    if (!ready) return;
    if (!visible || bypassed) {
      if (bypassed && visible) onClose();
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    let remaining = AD_DURATION;
    timer = setInterval(() => {
      remaining -= 1;
      setCountdown(Math.max(0, remaining));
      if (remaining <= 0) {
        if (timer) clearInterval(timer);
        // 原生廣告渲染在版位內，倒數結束直接關閉；沒回填（no-fill）也一樣關閉
        if (active) onClose();
      }
    }, 1000);

    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [visible, onClose, ready, bypassed]);

  if (!visible || bypassed) return null;

  const showNative = status === 'loaded' && nativeAd !== null;

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={[styles.overlay, { backgroundColor: dark ? 'rgba(0,0,0,0.78)' : 'rgba(28,25,23,0.42)' }]}>
        <View style={[styles.dialog, { backgroundColor: card, borderColor: border }]}>
          {/* 頂列：里程碑 + 倒數膠囊 */}
          <View style={styles.topBar}>
            <View style={styles.brandRow}>
              <View style={[styles.checkBadge, { backgroundColor: bg, borderColor: border }]}>
                <Text style={[styles.checkText, { color: accent }]}>✓</Text>
              </View>
              <View style={styles.brandText}>
                <Text style={[styles.appTitle, { color: text }]}>整理里程碑</Text>
                <Text style={[styles.appMeta, { color: muted }]}>累計整理 {sortedCount} 張</Text>
              </View>
            </View>
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
            <NativeAdView nativeAd={nativeAd} style={[styles.photoArea, { backgroundColor: bg, borderColor: border }]}>
              {/* Google 政策：必須標示為廣告 */}
              <View style={styles.adBadgeRow}>
                <View style={styles.adBadge}>
                  <Text style={styles.adBadgeText}>廣告</Text>
                </View>
                {nativeAd.advertiser ? (
                  <Text numberOfLines={1} style={[styles.advertiser, { color: muted }]}>
                    {nativeAd.advertiser}
                  </Text>
                ) : null}
              </View>

              {/* 媒體／圖片 = 照片本體 */}
              {nativeAd.mediaContent ? (
                <NativeMediaView style={[styles.media, { backgroundColor: card }]} />
              ) : nativeAd.icon ? (
                <Image source={{ uri: nativeAd.icon.url }} style={[styles.media, { backgroundColor: card }]} resizeMode="contain" />
              ) : null}

              {/* 標題 + 內文 */}
              <NativeAsset assetType={NativeAssetType.HEADLINE}>
                <Text numberOfLines={2} style={[styles.headline, { color: text }]}>
                  {nativeAd.headline}
                </Text>
              </NativeAsset>
              {nativeAd.body ? (
                <NativeAsset assetType={NativeAssetType.BODY}>
                  <Text numberOfLines={2} style={[styles.bodyText, { color: muted }]}>
                    {nativeAd.body}
                  </Text>
                </NativeAsset>
              ) : null}

              {/* CTA（= App 主要按鈕樣式，同時是後門觸發點） */}
              <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                <Pressable onPress={handleBackdoorTap} style={[styles.cta, { backgroundColor: accent }]}>
                  <Text numberOfLines={1} style={[styles.ctaText, { color: bg }]}>
                    {nativeAd.callToAction || '瞭解更多'}
                  </Text>
                </Pressable>
              </NativeAsset>
            </NativeAdView>
          ) : (
            <Pressable
              onPress={handleBackdoorTap}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={[styles.photoArea, { backgroundColor: bg, borderColor: border }]}
            >
              <View style={[styles.placeholder, { borderColor: border, backgroundColor: card }]}>
                <View style={[styles.placeholderBar, { backgroundColor: accent }]} />
                <Text style={[styles.placeholderText, { color: muted }]}>
                  {status === 'loading' ? '廣告載入中…' : '贊助內容 · 廣告載位'}
                </Text>
              </View>
            </Pressable>
          )}

          {/* 手勢膠囊提示（= ClassifyPhoto 語言） */}
          <View style={styles.pillRow}>
            <View style={styles.hintPill}>
              <ArrowCircle direction="left" size={16} color="#fff" />
              <Text numberOfLines={1} style={styles.hintText}>略過</Text>
            </View>
            <View style={[styles.hintPill, styles.hintTrash]}>
              <Text numberOfLines={1} style={styles.hintText}>捨棄</Text>
              <ArrowCircle direction="right" size={16} color="#fff" />
            </View>
          </View>

          {/* 底列 */}
          <View style={[styles.footer, { borderTopColor: border }]}>
            <Text style={[styles.footerInfo, { color: muted }]}>Google 廣告贊助託播</Text>
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
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  adBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adBadge: {
    backgroundColor: 'rgba(41,37,36,0.92)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  adBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  advertiser: {
    fontSize: 11,
    flexShrink: 1,
  },
  media: {
    width: '100%',
    height: 140,
    borderRadius: 8,
  },
  headline: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  bodyText: {
    fontSize: 12,
    lineHeight: 17,
  },
  cta: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '700',
  },
  placeholder: {
    width: '100%',
    minHeight: 80,
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
