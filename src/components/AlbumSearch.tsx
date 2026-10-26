import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/lib/theme';

export function AlbumSearch({ value, onChange, disabled = false }: {
  value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  const { text, muted, border, card } = useTheme();
  return (
    <View style={[styles.search, { borderColor: border, backgroundColor: card }]}>
      <TextInput accessibilityLabel="搜尋相簿名稱" placeholder="搜尋相簿名稱…" placeholderTextColor={muted}
        value={value} onChangeText={onChange} editable={!disabled} autoCorrect={false} autoCapitalize="none"
        returnKeyType="search" style={[styles.input, { color: text }]} />
      {!!value && <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel="清除相簿搜尋"
        onPress={() => onChange('')} style={styles.clear}><Text style={{ color: muted, fontSize: 20 }}>×</Text></Pressable>}
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10 },
  input: { flex: 1, minWidth: 0, minHeight: 40, paddingHorizontal: 12, fontSize: 14 },
  clear: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
});
