import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { migrateDbIfNeeded, DATABASE_NAME } from '@/lib/db';
import { SessionProvider } from '@/lib/session-context';
import { ThemeProvider, useTheme } from '@/lib/theme';

function ThemedStack() {
  const { dark } = useTheme();
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: dark ? '#0C0A09' : '#FFFFFF' },
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="review" options={{ presentation: 'card', headerShown: true, title: '檢查結果' }} />
        <Stack.Screen name="review-detail" options={{ presentation: 'card', headerShown: false }} />
        <Stack.Screen name="apply" options={{ presentation: 'card', headerShown: true, title: '確認並套用' }} />
        <Stack.Screen name="settings" options={{ presentation: 'card', headerShown: true, title: '設定' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
          <ThemeProvider>
            <SessionProvider>
              <ThemedStack />
            </SessionProvider>
          </ThemeProvider>
        </SQLiteProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
