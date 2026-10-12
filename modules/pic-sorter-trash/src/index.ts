import { Platform } from 'react-native';
import { NativeModule, requireNativeModule } from 'expo';

export type TrashStatus = 'trashed' | 'cancelled' | 'empty' | 'unsupported';

export interface NativeTrashResult {
  status: TrashStatus;
  requested: number;
  verified: number;
}

export type PicSorterTrashModuleEvents = {};

declare class PicSorterTrashNativeModule extends NativeModule<PicSorterTrashModuleEvents> {
  isTrashSupported: () => boolean;
  trashAssets: (uris: string[]) => Promise<NativeTrashResult>;
}

function loadNative(): PicSorterTrashNativeModule | null {
  try {
    return requireNativeModule<PicSorterTrashNativeModule>('PicSorterTrash');
  } catch {
    // Expo Go 或尚未 prebuild：視為不支援，JS 端降級處理
    return null;
  }
}

const native = loadNative();

/** 系統垃圾桶是否可用：僅 Android 11+ 的 dev build（含原生模組） */
export function isSystemTrashAvailable(): boolean {
  if (Platform.OS !== 'android') return false;
  if (typeof Platform.Version === 'number' && Platform.Version < 30) return false;
  if (!native) return false;
  try {
    return native.isTrashSupported();
  } catch {
    return false;
  }
}

/**
 * 把照片移入系統垃圾桶（Android 11+，會彈系統同意框）。
 * resolve 的 status 只有 'trashed' 代表成功；'cancelled'/'empty' 一律視為未完成。
 * 真正失敗一律 throw（呼叫端依 code 分類）。
 */
export async function trashAssets(uris: string[]): Promise<NativeTrashResult> {
  if (!native) throw new Error('System trash module is not available');
  return native.trashAssets(uris);
}
