import React from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StudioAnnouncement } from '@/lib/announcements';
import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/hooks/useTranslation';

interface Props {
  visible: boolean;
  announcement: StudioAnnouncement | null;
  onDismiss: () => void;
}

function isAllowedUrl(raw?: string): boolean {
  if (!raw) return false;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.startsWith('https://') || trimmed.startsWith('http://');
}

export function StudioAnnouncementModal({ visible, announcement, onDismiss }: Props) {
  const { bg, card, text, muted, accent, border } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  if (!visible || !announcement) return null;

  const dismissible = announcement.dismissible !== false;
  const hasCta = Boolean(announcement.cta_text?.trim() && isAllowedUrl(announcement.cta_url));
  const tagText = announcement.tag?.trim() || t('announcement.defaultTag');

  const handleCta = () => {
    const url = announcement.cta_url?.trim();
    if (url) {
      void Linking.openURL(url).catch(() => undefined);
    }
    if (dismissible) onDismiss();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={dismissible ? onDismiss : () => undefined}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: bg,
            paddingTop: Math.max(insets.top, 16) + 12,
            paddingBottom: Math.max(insets.bottom, 16) + 12,
            paddingLeft: Math.max(insets.left, 20),
            paddingRight: Math.max(insets.right, 20),
          },
        ]}>
        <View style={styles.topBar}>
          <View style={[styles.tagPill, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.tagText, { color: text }]}>{tagText}</Text>
          </View>
          {dismissible ? (
            <Pressable
              onPress={onDismiss}
              hitSlop={12}
              style={[styles.closeBtn, { backgroundColor: card, borderColor: border }]}>
              <Text style={[styles.closeText, { color: muted }]}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
          {announcement.title ? (
            <Text style={[styles.title, { color: text }]}>{announcement.title}</Text>
          ) : null}

          {announcement.message ? (
            <ScrollView style={styles.messageScroll} showsVerticalScrollIndicator>
              <Text style={[styles.message, { color: muted }]}>{announcement.message}</Text>
            </ScrollView>
          ) : null}

          <View style={styles.actions}>
            {hasCta ? (
              <Pressable onPress={handleCta} style={[styles.primaryBtn, { backgroundColor: accent }]}>
                <Text style={[styles.primaryBtnText, { color: bg }]}>{announcement.cta_text}</Text>
              </Pressable>
            ) : null}

            {dismissible ? (
              <Pressable
                onPress={onDismiss}
                style={[
                  hasCta ? styles.secondaryBtn : styles.primaryBtn,
                  hasCta
                    ? { backgroundColor: bg, borderColor: border, borderWidth: 1 }
                    : { backgroundColor: accent },
                ]}>
                <Text
                  style={[
                    hasCta ? styles.secondaryBtnText : styles.primaryBtnText,
                    { color: hasCta ? text : bg },
                  ]}>
                  {t('common.ok')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <Text style={[styles.signature, { color: muted }]}>yesolve studio</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tagPill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '700',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 22,
    gap: 14,
  },
  title: {
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 28,
  },
  messageScroll: {
    maxHeight: 300,
  },
  message: {
    fontSize: 15,
    lineHeight: 23,
  },
  actions: {
    gap: 10,
    marginTop: 8,
  },
  primaryBtn: {
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    borderRadius: 12,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  signature: {
    textAlign: 'center',
    fontSize: 11,
    letterSpacing: 1.5,
  },
});
