import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AlbumEntry } from '@/lib/album-order';
import { useTheme } from '@/lib/theme';

interface Props {
  visible: boolean;
  entry: AlbumEntry | null;
  shortcutIds: string[];
  allEntries: AlbumEntry[];
  onAssign: (slotIndex: number, swapWithEntry: AlbumEntry | null) => void;
  onClear: () => void;
  onClose: () => void;
}

const ACCENT = '#168BFF';

export function ShortcutSlotModal({
  visible,
  entry,
  shortcutIds,
  allEntries,
  onAssign,
  onClear,
  onClose,
}: Props) {
  const { bg, card, text, muted, border } = useTheme();

  if (!entry) return null;

  const currentSlot = shortcutIds.indexOf(entry.id);

  const handleSlotPress = (index: number) => {
    if (shortcutIds[index] === entry.id) {
      onClose();
      return;
    }

    const occupantId = shortcutIds[index];
    const occupant = occupantId ? allEntries.find((e) => e.id === occupantId) ?? null : null;

    if (!occupant) {
      onAssign(index, null);
      onClose();
      return;
    }

    Alert.alert(
      '互換快捷位置？',
      `快捷 ${index + 1} 目前為「${occupant.title}」，確定要將「${entry.title}」與「${occupant.title}」互換快捷位置嗎？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '確定互換',
          onPress: () => {
            onAssign(index, occupant);
            onClose();
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.dialog, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.title, { color: text }]}>設定快捷位置</Text>
          <Text numberOfLines={1} style={[styles.subtitle, { color: muted }]}>
            相簿：<Text style={{ color: text, fontWeight: '600' }}>{entry.title}</Text>
          </Text>
          <Text style={[styles.instruction, { color: muted }]}>
            點擊下方任一位置進行指派或互換：
          </Text>

          {/* 4 個橫向排列的元素，呼應主畫面底部位置 */}
          <View style={styles.slotsRow}>
            {Array.from({ length: 4 }).map((_, i) => {
              const occupantId = shortcutIds[i];
              const occupant = occupantId ? allEntries.find((e) => e.id === occupantId) : null;
              const isCurrent = occupantId === entry.id;

              return (
                <Pressable
                  key={i}
                  onPress={() => handleSlotPress(i)}
                  style={[
                    styles.slotItem,
                    {
                      borderColor: isCurrent ? ACCENT : occupant ? border : border,
                      backgroundColor: isCurrent ? '#168bff25' : bg,
                      borderStyle: occupant ? 'solid' : 'dashed',
                    },
                  ]}>
                  <View
                    style={[
                      styles.slotBadge,
                      { backgroundColor: isCurrent ? ACCENT : '#88888820' },
                    ]}>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: isCurrent ? '#FFFFFF' : text,
                        fontSize: 11,
                        fontWeight: '600',
                      }}>
                      快捷 {i + 1}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={2}
                    ellipsizeMode="tail"
                    style={[
                      styles.slotTitle,
                      {
                        color: isCurrent ? ACCENT : occupant ? text : muted,
                        fontWeight: isCurrent ? '700' : '500',
                      },
                    ]}>
                    {isCurrent ? '目前位置' : occupant ? occupant.title : '未設定'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actions}>
            {currentSlot >= 0 && (
              <Pressable
                onPress={() => {
                  onClear();
                  onClose();
                }}
                style={[styles.clearBtn, { borderColor: border }]}>
                <Text style={{ color: '#FF453A', fontSize: 14, fontWeight: '600' }}>
                  清除快捷（設為未設）
                </Text>
              </Pressable>
            )}
            <Pressable onPress={onClose} style={[styles.cancelBtn, { backgroundColor: bg }]}>
              <Text style={{ color: text, fontSize: 15, fontWeight: '500' }}>關閉</Text>
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
  },
  instruction: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 16,
  },
  slotsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginBottom: 20,
  },
  slotItem: {
    flex: 1,
    minHeight: 76,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  slotBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
  },
  slotTitle: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 15,
  },
  actions: {
    gap: 10,
  },
  clearBtn: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    minHeight: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
