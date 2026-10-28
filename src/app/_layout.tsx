import { useState, useEffect } from 'react';
import { SplashAdModal } from '@/components/SplashAdModal';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';
import { StyleSheet } from 'react-native';
import { migrateDbIfNeeded, DATABASE_NAME } from '@/lib/db';
import { SessionProvider } from '@/lib/session-context';
import { ThemeProvider, useTheme } from '@/lib/theme';

function ThemedStack() {
  const [showSplash, setShowSplash] = useState(true);
  const { dark, bg, text } = useTheme();

  // 深淺色跟著 App 主題走：狀態列圖示 + 底部導覽列按鈕 + 根視圖底色同步，
  // 避免圖1那種「內容深色、系統列卻白色」的斷層。
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(bg);
    try {
      NavigationBar.setStyle(dark ? 'dark' : 'light');
    } catch {
      // iOS / 舊機無導覽列：忽略
    }
  }, [dark, bg]);

  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <NavigationBar style={dark ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: bg },
          // 原生 header 也要吃主題，否則設定頁會出現白底黑字 header 配深色內容（圖1）
          headerStyle: { backgroundColor: bg },
          headerTintColor: text,
          headerTitleStyle: { color: text },
          headerShadowVisible: false,
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="review" options={{ presentation: 'card', headerShown: true, title: '檢查結果' }} />
        <Stack.Screen name="review-detail" options={{ presentation: 'card', headerShown: false }} />
        <Stack.Screen name="apply" options={{ presentation: 'card', headerShown: true, title: '套用變更' }} />
        <Stack.Screen name="settings" options={{ presentation: 'card', headerShown: true, title: '設定' }} />
      </Stack>
      <SplashAdModal visible={showSplash} onClose={() => setShowSplash(false)} />
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
