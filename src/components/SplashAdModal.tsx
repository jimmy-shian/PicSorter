import { useAdBypass } from '../lib/ad-bypass';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import mobileAds, { AppOpenAd, AdEventType } from 'react-native-google-mobile-ads';
import adConfig from '../../admob-config.json';

interface SplashAdModalProps {
  visible: boolean;
  onClose: () => void;
}



export function SplashAdModal({ visible, onClose }: SplashAdModalProps) {
  const { bypassed, ready, enableBypass } = useAdBypass();
  const [countdown, setCountdown] = useState(5);
  const clickTimestampsRef = useRef<number[]>([]);

  const handleBackdoorTap = async () => {
    const now = Date.now();
    const recent = [...clickTimestampsRef.current.filter((t) => now - t <= 3000), now];
    clickTimestampsRef.current = recent;

    if (recent.length >= 5) {
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
    let splashActive = true;
    let appOpenAd: ReturnType<typeof AppOpenAd.createForAdRequest> | undefined;
    let removeLoadedListener: (() => void) | undefined;
    let removeErrorListener: (() => void) | undefined;

    const splashAdUnitId = adConfig.units.splash;
    if (splashAdUnitId?.startsWith('ca-app-pub-')) {
      void mobileAds()
        .initialize()
        .then(() => {
          if (!splashActive) return;
          appOpenAd = AppOpenAd.createForAdRequest(splashAdUnitId);
          removeLoadedListener = appOpenAd.addAdEventListener(AdEventType.LOADED, () => {
            if (splashActive) void appOpenAd?.show().catch(() => undefined);
          });
          removeErrorListener = appOpenAd.addAdEventListener(AdEventType.ERROR, () => undefined);
          appOpenAd.load();
        })
        .catch(() => undefined);
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          splashActive = false;
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      splashActive = false;
      clearInterval(timer);
      removeLoadedListener?.();
      removeErrorListener?.();
    };
  }, [visible, onClose, ready, bypassed]);

  if (bypassed || !visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} statusBarTranslucent>
      <View style={styles.container}>
        {/* Top Minimal Bar */}
        <View style={styles.header}>
          <Pressable
            onPress={handleBackdoorTap}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 30 }}
            style={styles.branding}
          >
            <View style={styles.apertureIcon}>
              <View style={styles.apertureInner} />
            </View>
            <View>
              <Text style={styles.appTitle}>揀影 PicSorter</Text>
              <Text style={styles.appMeta}>本機相簿索引中 · 離線安全</Text>
            </View>
          </Pressable>

          <View style={styles.countdownBadge}>
            <Text style={styles.countdownText}>
              {countdown > 0 ? `0${countdown}s` : '進入 ›'}
            </Text>
          </View>
        </View>

        {/* Center: Physical Photo Stack Frame with Gesture Boundary */}
        <Pressable
          onPress={handleBackdoorTap}
          style={styles.photoFrame}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        >
          {/* Subtle Card Header */}
          <View style={styles.frameHeader}>
            <Text style={styles.frameIndexText}>INDEX #001 · RAW PREVIEW</Text>
            <Text style={styles.adTag}>SPONSORED</Text>
          </View>

          {/* Photo Canvas Simulation */}
          <View style={styles.photoCanvas}>
            {/* Gesture Compass Guidelines */}
            <View style={styles.compassTop}>
              <Text style={styles.compassText}>↑ 上滑加入目標相簿</Text>
            </View>

            <View style={styles.compassRow}>
              <Text style={styles.compassSideText}>← 略過保留</Text>
              <View style={styles.focusCenterRing}>
                <View style={styles.focusCenterCrossH} />
                <View style={styles.focusCenterCrossV} />
              </View>
              <Text style={styles.compassSideText}>右滑標記捨棄 →</Text>
            </View>

            <View style={styles.compassBottom}>
              <Text style={styles.compassSubText}>SQLite 本機資料庫 · 零網路傳輸</Text>
            </View>
          </View>

          {/* Frame Footer Metadata */}
          <View style={styles.frameFooter}>
            <Text style={styles.frameCaption}>直覺手勢整理相簿 · 維護隱私與儲存空間</Text>
            <Text style={styles.frameSlot}>ca-app-pub-5458979489586580/5677764204</Text>
          </View>
        </Pressable>

        {/* Bottom Status */}
        <View style={styles.bottomBar}>
          <Text style={styles.studioSignature}>yesolve studio</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0A09',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  branding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  apertureIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#292524',
    backgroundColor: '#1C1917',
    alignItems: 'center',
    justifyContent: 'center',
  },
  apertureInner: {
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: '#A8A29E',
  },
  appTitle: {
    color: '#FAFAF9',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  appMeta: {
    color: '#78716C',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 1,
  },
  countdownBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#1C1917',
    borderWidth: 1,
    borderColor: '#292524',
  },
  countdownText: {
    color: '#A8A29E',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '500',
  },
  photoFrame: {
    backgroundColor: '#141210',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#292524',
    padding: 16,
    marginVertical: 'auto',
  },
  frameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  frameIndexText: {
    color: '#78716C',
    fontSize: 10,
    fontFamily: 'monospace',
    letterSpacing: 0.8,
  },
  adTag: {
    color: '#57534E',
    fontSize: 9,
    fontFamily: 'monospace',
    borderWidth: 1,
    borderColor: '#292524',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  photoCanvas: {
    backgroundColor: '#0C0A09',
    borderWidth: 1,
    borderColor: '#292524',
    borderRadius: 8,
    height: 220,
    padding: 14,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compassTop: {
    alignItems: 'center',
  },
  compassText: {
    color: '#D6D3D1',
    fontSize: 12,
    fontWeight: '500',
  },
  compassRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 6,
  },
  compassSideText: {
    color: '#A8A29E',
    fontSize: 11,
  },
  focusCenterRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#44403C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusCenterCrossH: {
    position: 'absolute',
    width: 14,
    height: 1,
    backgroundColor: '#78716C',
  },
  focusCenterCrossV: {
    position: 'absolute',
    width: 1,
    height: 14,
    backgroundColor: '#78716C',
  },
  compassBottom: {
    alignItems: 'center',
  },
  compassSubText: {
    color: '#57534E',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  frameFooter: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1C1917',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  frameCaption: {
    color: '#A8A29E',
    fontSize: 11,
    flex: 1,
  },
  frameSlot: {
    color: '#44403C',
    fontSize: 9,
    fontFamily: 'monospace',
    marginLeft: 8,
  },
  bottomBar: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  studioSignature: {
    color: '#44403C',
    fontSize: 11,
    fontFamily: 'monospace',
    letterSpacing: 0.5,
  },
});
