import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
  type NativeAd,
} from 'react-native-google-mobile-ads';
import { useTheme } from '../lib/theme';
import { useTranslation } from '@/hooks/useTranslation';

interface NativeAdCardProps {
  nativeAd: NativeAd;
  mediaHeight?: number;
  onCtaPress?: () => void;
}

/**
 * Shared AdMob Native Advanced card used by SplashAdModal and MilestoneAdModal.
 * Avoids passing borderRadius directly to NativeAdView/NativeMediaView and keeps
 * mediaHeight >= 220 so even 9:16 vertical videos exceed AdMob's 120x120 minimum.
 */
export function NativeAdCard({ nativeAd, mediaHeight = 240, onCtaPress }: NativeAdCardProps) {
  const { bg, card, text, muted, accent, border } = useTheme();
  const { t } = useTranslation();

  const iconUrl = typeof nativeAd.icon?.url === 'string' && nativeAd.icon.url.length > 0 ? nativeAd.icon.url : null;
  const headlineText = typeof nativeAd.headline === 'string' && nativeAd.headline.length > 0 ? nativeAd.headline : t('ad.label');
  const ctaText =
    typeof nativeAd.callToAction === 'string' && nativeAd.callToAction.length > 0
      ? nativeAd.callToAction
      : t('ad.ctaDefault');

  const ctaContent = (
    <View collapsable={false} style={[styles.cta, { backgroundColor: accent }]}>
      <Text numberOfLines={1} style={[styles.ctaText, { color: bg }]}>
        {ctaText}
      </Text>
    </View>
  );

  return (
    <View collapsable={false} style={[styles.photoAreaFrame, { backgroundColor: bg, borderColor: border }]}>
      <NativeAdView nativeAd={nativeAd} collapsable={false} style={styles.nativeAdContainer}>
        {/* Google policy: clearly label as an ad */}
        <View style={styles.adBadgeRow}>
          <View style={styles.adBadge}>
            <Text style={styles.adBadgeText}>{t('ad.badge')}</Text>
          </View>
          {nativeAd.advertiser ? (
            <NativeAsset assetType={NativeAssetType.ADVERTISER}>
              <View collapsable={false} style={styles.advertiserWrap}>
                <Text numberOfLines={1} style={[styles.advertiser, { color: muted }]}>
                  {nativeAd.advertiser}
                </Text>
              </View>
            </NativeAsset>
          ) : null}
        </View>

        {/* Media / Icon slot rendered directly inside NativeAdView */}
        {nativeAd.mediaContent ? (
          <NativeMediaView style={[styles.mediaView, { backgroundColor: card, height: mediaHeight }]} />
        ) : iconUrl ? (
          <Image source={{ uri: iconUrl }} style={[styles.mediaImage, { backgroundColor: card, height: mediaHeight }]} resizeMode="contain" />
        ) : null}

        {/* Headline + Body */}
        <NativeAsset assetType={NativeAssetType.HEADLINE}>
          <View collapsable={false}>
            <Text numberOfLines={2} style={[styles.headline, { color: text }]}>
              {headlineText}
            </Text>
          </View>
        </NativeAsset>
        {nativeAd.body ? (
          <NativeAsset assetType={NativeAssetType.BODY}>
            <View collapsable={false}>
              <Text numberOfLines={2} style={[styles.bodyText, { color: muted }]}>
                {nativeAd.body}
              </Text>
            </View>
          </NativeAsset>
        ) : null}

        {/* Call to Action */}
        <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
          {onCtaPress ? <Pressable collapsable={false} onPress={onCtaPress}>{ctaContent}</Pressable> : ctaContent}
        </NativeAsset>
      </NativeAdView>
    </View>
  );
}

const styles = StyleSheet.create({
  photoAreaFrame: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  nativeAdContainer: {
    width: '100%',
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
  advertiserWrap: {
    flexShrink: 1,
  },
  advertiser: {
    fontSize: 11,
    flexShrink: 1,
  },
  mediaView: {
    width: '100%',
    maxWidth: '100%',
    aspectRatio: undefined,
    minWidth: 120,
    minHeight: 160,
  },
  mediaImage: {
    width: '100%',
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
});
