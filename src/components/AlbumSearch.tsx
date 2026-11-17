import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/hooks/useTranslation';

export function AlbumSearch({ value, onChange, disabled = false }: {
  value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  const { text, muted, border, card } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={[styles.search, { borderColor: border, backgroundColor: card }]}>
      <TextInput accessibilityLabel={t('albumSearch.accessibilityLabel')} placeholder={t('albumSearch.placeholder')} placeholderTextColor={muted}
        value={value} onChangeText={onChange} editable={!disabled} autoCorrect={false} autoCapitalize="none"
        returnKeyType="search" style={[styles.input, { color: text }]} />
      {!!value && <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={t('albumSearch.accessibilityClear')}
        onPress={() => onChange('')} style={styles.clear}><Text style={{ color: muted, fontSize: 20 }}>×</Text></Pressable>}
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10 },
  input: { flex: 1, minWidth: 0, minHeight: 40, paddingHorizontal: 12, fontSize: 14 },
  clear: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
});
