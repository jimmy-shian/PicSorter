import type * as SQLite from 'expo-sqlite';
import { getPref, setPref } from './db';

export const STUDIO_ANNOUNCEMENTS_URL = 'https://home.yesolve-studio.workers.dev/announcements.json';
const STUDIO_APP_ID = 'picsorter';
const KEY_SEEN_IDS = 'yesolve_announcements_seen_ids';
const KEY_DAILY_LAST = 'yesolve_announcements_daily_last';

export interface StudioAnnouncement {
  id: string;
  apps?: string[];
  enabled?: boolean;
  start_at?: string;
  end_at?: string;
  frequency?: 'once' | 'daily' | 'always' | string;
  dismissible?: boolean;
  tag?: string;
  title?: string;
  message?: string;
  cta_text?: string;
  cta_url?: string;
}

interface AnnouncementsPayload {
  version?: number;
  updated_at?: string;
  announcements?: StudioAnnouncement[];
}

function localDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIsoMillis(raw?: string): number | null {
  if (!raw || !raw.trim()) return null;
  const ms = Date.parse(raw.trim());
  return Number.isFinite(ms) ? ms : null;
}

function parseJsonSafe<T>(raw: string, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function fetchActiveAnnouncement(
  db: SQLite.SQLiteDatabase,
): Promise<StudioAnnouncement | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(STUDIO_ANNOUNCEMENTS_URL, {
      method: 'GET',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as AnnouncementsPayload;
    const list = Array.isArray(payload?.announcements) ? payload.announcements : [];
    const seenIds = parseJsonSafe<string[]>(await getPref(db, KEY_SEEN_IDS, '[]'), []);
    const dailyMap = parseJsonSafe<Record<string, string>>(await getPref(db, KEY_DAILY_LAST, '{}'), {});
    const nowMs = Date.now();
    const today = localDateKey();

    for (const item of list) {
      if (!item || !item.id || item.enabled === false) continue;
      if (!item.title?.trim() && !item.message?.trim()) continue;

      const targets = Array.isArray(item.apps)
        ? item.apps.map((a) => String(a).trim().toLowerCase())
        : [];
      if (targets.length > 0 && !targets.includes('all') && !targets.includes(STUDIO_APP_ID)) {
        continue;
      }

      if (item.start_at?.trim()) {
        const startMs = parseIsoMillis(item.start_at);
        if (startMs === null || nowMs < startMs) continue;
      }
      if (item.end_at?.trim()) {
        const endMs = parseIsoMillis(item.end_at);
        if (endMs === null || nowMs > endMs) continue;
      }

      const freq = String(item.frequency || 'once').trim().toLowerCase();
      if (freq === 'always') return item;
      if (freq === 'daily') {
        if (dailyMap[item.id] !== today) return item;
        continue;
      }
      if (!seenIds.includes(item.id)) return item;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function markAnnouncementDismissed(
  db: SQLite.SQLiteDatabase,
  item: StudioAnnouncement,
): Promise<void> {
  if (!item.id) return;
  const freq = String(item.frequency || 'once').trim().toLowerCase();
  if (freq === 'always') return;
  if (freq === 'daily') {
    const dailyMap = parseJsonSafe<Record<string, string>>(await getPref(db, KEY_DAILY_LAST, '{}'), {});
    dailyMap[item.id] = localDateKey();
    await setPref(db, KEY_DAILY_LAST, JSON.stringify(dailyMap));
    return;
  }
  const seenIds = parseJsonSafe<string[]>(await getPref(db, KEY_SEEN_IDS, '[]'), []);
  if (!seenIds.includes(item.id)) {
    seenIds.push(item.id);
    await setPref(db, KEY_SEEN_IDS, JSON.stringify(seenIds));
  }
}
