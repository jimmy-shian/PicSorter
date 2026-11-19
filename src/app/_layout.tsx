import { useState, useEffect } from 'react';
import { SplashAdModal } from '@/components/SplashAdModal';
import { SpotlightTutorial } from '@/components/SpotlightTutorial';
import { StudioAnnouncementModal } from '@/components/StudioAnnouncementModal';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';
import { StyleSheet } from 'react-native';
import { migrateDbIfNeeded, DATABASE_NAME } from '@/lib/db';
import {
  fetchActiveAnnouncement,
  markAnnouncementDismissed,
  type StudioAnnouncement,
} from '@/lib/announcements';
import { SessionProvider, useSession } from '@/lib/session-context';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { useTranslation } from '@/hooks/useTranslation';

// Initialize i18n early
import '@/i18n';

function ThemedStack() {
  const [showSplash, setShowSplash] = useState(true);
  const [splashSettled, setSplashSettled] = useState(false);
  const [announcement, setAnnouncement] = useState<StudioAnnouncement | null>(null);
  const { dark, bg, text } = useTheme();
  const { t } = useTranslation();
  const db = useSQLiteContext();
  const session = useSession();

  useEffect(() => {
    if (showSplash) {
      setSplashSettled(false);
      return;
    }
    const timer = setTimeout(() => setSplashSettled(true), 200);
    return () => clearTimeout(timer);
  }, [showSplash]);

  useEffect(() => {
    let active = true;
    void fetchActiveAnnouncement(db).then((item) => {
      if (active && item) setAnnouncement(item);
    });
    return () => {
      active = false;
    };
  }, [db]);

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
        <Stack.Screen name="review" options={{ presentation: 'card', headerShown: true, title: t('navigation.review') }} />
        <Stack.Screen name="review-detail" options={{ presentation: 'card', headerShown: false }} />
        <Stack.Screen name="apply" options={{ presentation: 'card', headerShown: true, title: t('navigation.apply') }} />
        <Stack.Screen name="settings" options={{ presentation: 'card', headerShown: true, title: t('navigation.settings') }} />
      </Stack>
      <SplashAdModal visible={showSplash} onClose={() => setShowSplash(false)} />
      <StudioAnnouncementModal
        visible={splashSettled && announcement !== null}
        announcement={announcement}
        onDismiss={() => {
          if (announcement) {
            void markAnnouncementDismissed(db, announcement);
          }
          setAnnouncement(null);
        }}
      />
      <SpotlightTutorial
        visible={splashSettled && announcement === null && session.tutorialVisible && session.boot === 'ready'}
        onClose={() => session.setTutorialVisible(false)}
      />
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
