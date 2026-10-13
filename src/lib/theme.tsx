import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import type { ThemeMode } from '@/types';

interface Theme {
  mode: ThemeMode;
  dark: boolean;
  bg: string;
  card: string;
  text: string;
  muted: string;
  accent: string;
  danger: string;
  border: string;
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<Theme | null>(null);

const LIGHT = {
  bg: '#FFFFFF',
  card: '#F5F5F4',
  text: '#1C1917',
  muted: '#78716C',
  accent: '#1C1917',
  danger: '#DC2626',
  border: '#E7E5E4',
};

const DARK = {
  bg: '#0C0A09',
  card: '#1C1917',
  text: '#FAFAF9',
  muted: '#A8A29E',
  accent: '#FAFAF9',
  danger: '#F87171',
  border: '#292524',
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('system');
  const dark = mode === 'dark' || (mode === 'system' && system === 'dark');
  const palette = dark ? DARK : LIGHT;
  const value = useMemo<Theme>(
    () => ({ mode, dark, ...palette, setMode }),
    [mode, dark, palette],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
