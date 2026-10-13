export type SortOrder = 'newest' | 'oldest';

export type DecisionAction = 'album' | 'trash';

export interface SourceAlbum {
  /** expo-media-library Album.id；「所有照片」用 null 表示 */
  id: string | null;
  title: string;
  /** 系統回報的照片數（可能為估計值） */
  count?: number;
}

export interface TargetAlbum {
  id: string;
  title: string;
}

export interface ClassifyItem {
  assetId: string;
  uri: string;
  width: number;
  height: number;
  creationTime: number | null;
  mediaType?: 'image' | 'video';
  duration?: number;
}

export interface SessionSummary {
  sessionId: string;
  sourceAlbumId: string | null;
  sourceAlbumTitle: string;
  totalProcessed: number;
  perAlbum: { albumId: string; title: string; count: number }[];
  trashCount: number;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export type GestureAction = 'album' | 'trash' | 'skip' | 'inspect' | 'none';
export type GestureDirection = 'up' | 'down' | 'left' | 'right';
export type GestureSettings = Record<GestureDirection, GestureAction>;
