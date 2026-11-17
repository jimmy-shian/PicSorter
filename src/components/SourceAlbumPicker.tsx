import { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/hooks/useTranslation';
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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [keyword, setKeyword] = useState('');
  const [albums, setAlbums] = useState<SourceAlbum[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const res = await listSourceAlbums();
        if (active) setAlbums(res);
      } catch {
        if (active) setAlbums([{ id: null, title: t('sourceAlbumPicker.allPhotos') }]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [visible]);

  const handleClose = () => {
    setKeyword('');
    onClose();
  };

  const handleSelect = (item: SourceAlbum) => {
    setKeyword('');
    onSelect(item);
    onClose();
  };

  const filtered = keyword.trim()
    ? albums.filter((a) => a.title.toLowerCase().includes(keyword.trim().toLowerCase()))
    : albums;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <KeyboardAvoidingView behavior="padding" style={styles.avoid}>
        <Pressable
          style={[styles.sheet, { backgroundColor: bg, borderColor: border, paddingBottom: insets.bottom + 16 }]}
          onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: text }]}>{t('sourceAlbumPicker.title')}</Text>
            <Text style={[styles.countText, { color: muted }]}>{t('sourceAlbumPicker.albumCount', { count: albums.length })}</Text>
          </View>
          <Text style={[styles.sub, { color: muted }]}>
            {t('sourceAlbumPicker.description')}
          </Text>

          {albums.length > 6 ? (
            <TextInput
              style={[styles.searchInput, { borderColor: border, color: text, backgroundColor: card }]}
              placeholder={t('sourceAlbumPicker.placeholder')}
              placeholderTextColor={muted}
              value={keyword}
              onChangeText={setKeyword}
              clearButtonMode="while-editing"
            />
          ) : null}

          {loading ? (
            <Text style={{ color: muted, paddingVertical: 20, textAlign: 'center' }}>{t('sourceAlbumPicker.loading')}</Text>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id ?? '__all__'}
              renderItem={({ item }) => {
                const active = (item.id ?? null) === (current.id ?? null);
                return (
                  <Pressable
                    style={[styles.row, { backgroundColor: active ? card : 'transparent' }]}
                    onPress={() => handleSelect(item)}>
                    <Text style={[styles.rowText, { color: text, fontWeight: active ? '700' : '400' }]}>
                      {item.title}
                    </Text>
                    {active ? <Text style={{ color: text, fontWeight: '700' }}>✓</Text> : null}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={{ color: muted, paddingVertical: 20, textAlign: 'center' }}>
                  {t('gestureAlbumSheet.emptySearch', { keyword })}
                </Text>
              }
            />
          )}
          <View style={{ height: 8 }} />
          <Pressable style={[styles.closeBtn, { borderColor: border }]} onPress={handleClose}>
            <Text style={{ color: muted }}>{t('common.close')}</Text>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
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
  avoid: {
    flex: 1,
    justifyContent: 'flex-end',
  },
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  countText: {
    fontSize: 12,
  },
  title: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2, marginBottom: 10 },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 8,
  },
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
