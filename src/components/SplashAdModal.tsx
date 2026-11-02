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

interface SplashAdModalProps {
  visible: boolean;
  onClose: () => void;
}

/** 統一倒數長度（秒） */
const AD_DURATION = 5;
/** 後門略過：5 秒內累計 5 次點擊 */
const BACKDOOR_WINDOW = 5000;
const BACKDOOR_CLICKS = 5;

/**
 * 開場廣告：直接重現 ClassifyPhoto 的分類畫面。
 * 一張照片卡，四周浮著 App 真實使用的手勢膠囊提示條。
 *
 * 「廣告畫面」與「真正的 Google 廣告」合為同一層：
 * 使用 AdMob「原生進階 (Native Advanced)」廣告單元，素材（媒體／標題／
 * 內文／CTA）就渲染在照片本體的位置 —— 不再有第二層全螢幕蓋版。
 *
 * 注意：AdMob 的廣告單元類型必須與 API 一致 —— 開場請求 NativeAd，
 * 因此 AdMob 後台的開場廣告單元必須是「原生進階」類型；
 * 若仍是「應用程式開放」單元，會一直 no-fill（畫面只顯示設計佔位）。
 */
export function SplashAdModal({ visible, onClose }: SplashAdModalProps) {
  const { bypassed, ready, enableBypass } = useAdBypass();
  const { bg, card, text, muted, accent, border } = useTheme();
  const [countdown, setCountdown] = useState(AD_DURATION);
  const clickTimestampsRef = useRef<number[]>([]);

  const splashAdUnitId = adConfig.units.splash;
  const hasNativeUnit =
    typeof splashAdUnitId === 'string' && splashAdUnitId.startsWith('ca-app-pub-');

  const { status, nativeAd } = useNativeAd({
    adUnitId: hasNativeUnit ? (splashAdUnitId as string) : null,
    autoLoad: ready && !bypassed && visible,
  });

  // 後門略過：5 秒內累計 5 次點擊（頂列 / 照片卡）
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
    let remaining = AD_DURATION;
    const timer = setInterval(() => {
      remaining -= 1;
      setCountdown(Math.max(0, remaining));
      if (remaining <= 0) {
        if (timer) clearInterval(timer);
        // 廣告渲染在版位內（非全螢幕蓋版），倒數結束由程式關閉；no-fill 也一樣
        if (active) onClose();
      }
    }, 1000);

    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [visible, onClose, ready, bypassed]);

  if (bypassed || !visible) return null;

  const showNative = status === 'loaded' && nativeAd !== null;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} statusBarTranslucent>
      <View style={[styles.container, { backgroundColor: bg }]}>
        {/* 頂列：App 識別 + 倒數膠囊 */}
        <View style={styles.topBar}>
          <Pressable
            onPress={handleBackdoorTap}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            style={styles.branding}
          >
            <View style={[styles.brandMark, { borderColor: border, backgroundColor: card }]}>
              <View style={[styles.brandMarkDot, { borderColor: accent }]} />
            </View>
            <View style={styles.brandText}>
              <Text style={[styles.appTitle, { color: text }]}>揀影 PicSorter</Text>
              <Text style={[styles.appMeta, { color: muted }]}>相簿索引中 · 離線安全</Text>
            </View>
          </Pressable>

          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{countdown}s</Text>
          </View>
        </View>

        {/* 頂部倒數進度條（= App 的細進度條語言） */}
        <View style={[styles.progressTrack, { backgroundColor: border }]}>
          <View style={[styles.progressFill, { backgroundColor: accent, width: `${(countdown / AD_DURATION) * 100}%` }]} />
        </View>

        {/* 照片卡：廣告素材渲染在照片本體位置，四周是 App 真實的手勢膠囊提示 */}
        <Pressable onPress={handleBackdoorTap} style={[styles.photoCard, { backgroundColor: card, borderColor: border }]}>
          {/* 照片本體位置：原生進階廣告 / 佔位 */}
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

              {/* CTA（= App 主要按鈕樣式；點擊由 NativeAdView 記錄） */}
              <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                <View style={[styles.cta, { backgroundColor: accent }]}>
                  <Text numberOfLines={1} style={[styles.ctaText, { color: bg }]}>
                    {nativeAd.callToAction || '瞭解更多'}
                  </Text>
                </View>
              </NativeAsset>
            </NativeAdView>
          ) : (
            <View style={[styles.photoArea, { backgroundColor: bg, borderColor: border }]}>
              <View style={[styles.placeholder, { borderColor: border, backgroundColor: card }]}>
                <View style={[styles.placeholderBar, { backgroundColor: accent }]} />
                <Text style={[styles.placeholderText, { color: muted }]}>
                  {status === 'loading' ? '廣告載入中…' : '贊助內容 · 廣告載位'}
                </Text>
              </View>
            </View>
          )}

          {/* 懸浮手勢膠囊提示條（= ClassifyPhoto 的 unifiedTopHint） */}
          <View style={[styles.hintPill, styles.hintUp]} pointerEvents="none">
            <ArrowCircle direction="up" size={18} color="#fff" />
            <Text numberOfLines={1} style={styles.hintText}>加入目標相簿</Text>
          </View>

          <View style={[styles.hintPill, styles.hintLeft]} pointerEvents="none">
            <ArrowCircle direction="left" size={18} color="#fff" />
            <Text numberOfLines={1} style={styles.hintText}>略過</Text>
          </View>

          <View style={[styles.hintPill, styles.hintTrash]} pointerEvents="none">
            <Text numberOfLines={1} style={styles.hintText}>捨棄</Text>
            <ArrowCircle direction="right" size={18} color="#fff" />
          </View>
        </Pressable>

        {/* 底列 */}
        <View style={styles.bottomBar}>
          <Text style={[styles.bottomNote, { color: muted }]}>直覺手勢整理相簿 · 維護隱私與儲存空間</Text>
          <Text style={[styles.studioSignature, { color: muted }]}>yesolve studio</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 28,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  branding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    flexShrink: 1,
  },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkDot: {
    width: 12,
    height: 12,
    borderRadius: 3,
    borderWidth: 2,
  },
  brandText: {
    flexShrink: 1,
  },
  appTitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  appMeta: {
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 1,
  },
  /* = ClassifyPhoto 的 unifiedTopHint 膠囊 */
  countPill: {
    backgroundColor: 'rgba(28,25,23,0.92)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  countPillText: {
    color: '#fff',
    fontSize: 14,
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
  photoCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    justifyContent: 'center',
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
    height: 150,
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
    minHeight: 130,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  placeholderBar: {
    width: 120,
    height: 3,
    borderRadius: 999,
    opacity: 0.65,
  },
  placeholderText: {
    fontSize: 10,
    fontFamily: 'monospace',
    letterSpacing: 1.2,
  },
  /* = ClassifyPhoto 的 unifiedTopHint（懸浮膠囊） */
  hintPill: {
    position: 'absolute',
    maxWidth: '94%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: 'rgba(41,37,36,0.92)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  hintUp: {
    top: 14,
    alignSelf: 'center',
    backgroundColor: 'rgba(28,25,23,0.92)',
  },
  hintLeft: {
    bottom: 16,
    left: 16,
  },
  hintTrash: {
    bottom: 16,
    right: 16,
    backgroundColor: 'rgba(220,38,38,0.92)',
  },
  hintText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  bottomBar: {
    alignItems: 'center',
    gap: 4,
    paddingTop: 14,
  },
  bottomNote: {
    fontSize: 11,
    textAlign: 'center',
  },
  studioSignature: {
    fontSize: 11,
    fontFamily: 'monospace',
    letterSpacing: 0.5,
    opacity: 0.7,
  },
});
