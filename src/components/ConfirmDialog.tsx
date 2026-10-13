import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * App 內統一樣式的確認框，取代原生 Alert。
 * 原生 Alert 在深色模式下是系統白底/黑字（圖1突兀問題），這裡全吃主題色。
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = '確認',
  cancelText = '取消',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const { bg, text, muted, border, card, danger } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            { backgroundColor: bg, borderColor: border, marginBottom: insets.bottom + 24 },
          ]}>
          <Text style={[styles.title, { color: text }]}>{title}</Text>
          {message ? <Text style={[styles.message, { color: muted }]}>{message}</Text> : null}
          <View style={[styles.btnRow, { borderTopColor: border }]}>
            <Pressable
              style={[styles.btn, { backgroundColor: card }]}
              onPress={onCancel}
              disabled={busy}>
              <Text style={[styles.btnText, { color: muted }]}>{cancelText}</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, { backgroundColor: destructive ? danger : text }]}
              onPress={onConfirm}
              disabled={busy}>
              <Text style={[styles.btnText, { color: destructive ? '#FFFFFF' : bg }]}>
                {busy ? '處理中…' : confirmText}
              </Text>
            </Pressable>
          </View>
          {destructive ? (
            <Text style={[styles.hint, { color: muted }]}>照片本身不受影響，只清除本機整理紀錄</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  title: { fontSize: 17, fontWeight: '800' },
  message: { fontSize: 14, lineHeight: 21 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 8, borderTopWidth: 0, paddingTop: 4 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  btnText: { fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 11, textAlign: 'center', marginTop: 2 },
});
