import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import type { TargetAlbum } from '@/types';

interface Props {
  visible: boolean;
  title: string;
  targets: TargetAlbum[];
  onPick: (id: string) => void;
  onClose: () => void;
}

/** 檢查頁用：把選中的照片改放至其他目標相簿 */
export function TargetAlbumSheet({ visible, title, targets, onPick, onClose }: Props) {
  const { bg, text, muted, border, card } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: bg, borderColor: border, paddingBottom: insets.bottom + 16 }]}
          onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={[styles.title, { color: text }]}>{title}</Text>
          {targets.length === 0 ? (
            <Text style={[styles.empty, { color: muted }]}>沒有可用的目標相簿</Text>
          ) : (
            <FlatList
              data={targets}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.row, { backgroundColor: card }]}
                  onPress={() => {
                    onPick(item.id);
                    onClose();
                  }}>
                  <Text style={[styles.rowText, { color: text }]}>{item.title}</Text>
                </Pressable>
              )}
            />
          )}
          <Pressable style={[styles.closeBtn, { borderColor: border }]} onPress={onClose}>
            <Text style={{ color: muted }}>取消</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    padding: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#A8A29E',
    marginBottom: 10,
  },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  empty: { fontSize: 13, paddingVertical: 12, textAlign: 'center' },
  row: { paddingVertical: 13, paddingHorizontal: 12, borderRadius: 8, marginBottom: 6 },
  rowText: { fontSize: 15 },
  closeBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
});
