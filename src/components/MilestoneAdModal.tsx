import { useAdBypass } from '../lib/ad-bypass';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';


interface MilestoneAdModalProps {
  visible: boolean;
  sortedCount: number;
  onClose: () => void;
}

export function MilestoneAdModal({ visible, sortedCount, onClose }: MilestoneAdModalProps) {
  const { bypassed, ready, enableBypass } = useAdBypass();
  const [countdown, setCountdown] = useState(3);
  const clickTimestampsRef = useRef<number[]>([]);

  // 5 taps within 3s triggers bypass
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
    setCountdown(3);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [visible, onClose, ready, bypassed]);

  if (!visible || bypassed) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.milestoneTag}>
              <Text style={styles.milestoneText}>進度里程碑 · 累計整理 {sortedCount} 張</Text>
            </View>
            <View style={styles.countdownBadge}>
              <Text style={styles.countdownText}>
                {countdown > 0 ? `倒數 ${countdown}s` : '完成 ›'}
              </Text>
            </View>
          </View>

          {/* Ad Content (Backdoor target) */}
          <Pressable onPress={handleBackdoorTap} style={styles.adBody}>
            <View style={styles.frameBadge}>
              <Text style={styles.frameText}>✓</Text>
            </View>
            <Text style={styles.adHeading}>相簿整理階段完成</Text>
            <Text style={styles.adSub}>本機 SQLite 安全儲存分類紀錄</Text>

            <View style={styles.sponsorBox}>
              <Text style={styles.sponsorTitle}>官方廣告單元 · ca-app-pub-5458979489586580/1124897797</Text>
              <Text style={styles.sponsorDesc}>yesolve studio 智慧相簿整理推薦贊助</Text>
            </View>
          </Pressable>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerInfo}>Google 廣告贊助託播</Text>
            <Text style={styles.timerInfo}>{countdown} 秒後自動返回相簿</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1C1917',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#292524',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  milestoneTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#292524',
  },
  milestoneText: {
    color: '#FAFAF9',
    fontSize: 11,
    fontWeight: '600',
  },
  countdownBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#0C0A09',
    borderWidth: 1,
    borderColor: '#292524',
  },
  countdownText: {
    color: '#A8A29E',
    fontSize: 11,
    fontWeight: '600',
  },
  adBody: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  frameBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0C0A09',
    borderWidth: 1,
    borderColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  frameText: {
    color: '#10B981',
    fontSize: 18,
    fontWeight: 'bold',
  },
  adHeading: {
    color: '#FAFAF9',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  adSub: {
    color: '#A8A29E',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 16,
  },
  sponsorBox: {
    width: '100%',
    backgroundColor: '#0C0A09',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#292524',
    alignItems: 'center',
  },
  sponsorTitle: {
    color: '#78716C',
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  sponsorDesc: {
    color: '#D6D3D1',
    fontSize: 12,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#292524',
  },
  footerInfo: {
    color: '#57534E',
    fontSize: 10,
  },
  timerInfo: {
    color: '#78716C',
    fontSize: 10,
  },
});
