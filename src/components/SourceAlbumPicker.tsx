import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { listSourceAlbums } from '@/lib/media';
import type { SourceAlbum } from '@/types';

interface Props {
  visible: boolean;
  current: SourceAlbum;
  onSelect: (s: SourceAlbum) => void;
  onClose: () => void;
}

export function SourceAlbumPicker({ visible, current, onSelect, onClose }: Props) {
  const { bg, text, muted, border, card } = useTheme();
  const [albums, setAlbums] = useState<SourceAlbum[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    listSourceAlbums()
      .then(setAlbums)
      .catch(() => setAlbums([{ id: null, title: '所有照片' }]))
      .finally(() => setLoading(false));
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: bg, borderColor: border }]} onPress={() => {}}>
          <Text style={[styles.title, { color: text }]}>選擇來源相簿</Text>
          {loading ? (
            <Text style={{ color: muted }}>讀取中…</Text>
          ) : (
            <FlatList
              data={albums}
              keyExtractor={(item) => item.id ?? '__all__'}
              renderItem={({ item }) => {
                const active = (item.id ?? null) === (current.id ?? null);
                return (
                  <Pressable
                    style={[styles.row, { backgroundColor: active ? card : 'transparent' }]}
                    onPress={() => {
                      onSelect(item);
                      onClose();
                    }}>
                    <Text style={[styles.rowText, { color: text, fontWeight: active ? '700' : '400' }]}>
                      {item.title}
                    </Text>
                    {active ? <Text style={{ color: muted }}>✓</Text> : null}
                  </Pressable>
                );
              }}
            />
          )}
          <View style={{ height: 8 }} />
          <Pressable style={[styles.closeBtn, { borderColor: border }]} onPress={onClose}>
            <Text style={{ color: muted }}>關閉</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '70%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    padding: 16,
  },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  rowText: { fontSize: 15 },
  closeBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
});
