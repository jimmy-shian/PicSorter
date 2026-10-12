import { Platform } from 'react-native';
import { Asset } from 'expo-media-library';
import { isSystemTrashAvailable, trashAssets } from '../../modules/pic-sorter-trash';

export type TrashOutcome =
  /** 已移入系統垃圾桶（Android 11+）或最近刪除（iOS） */
  | { kind: 'trashed'; count: number }
  /** 使用者未確認（系統框取消/關閉）：未完成，不記失敗 */
  | { kind: 'cancelled' };

/**
 * 把照片移入系統垃圾桶 / 最近刪除。
 *
 * - iOS：expo 的 Asset.delete 即 PhotoKit deleteAssets →「最近刪除」，無系統框。
 * - Android 11+：自研模組走 MediaStore.createTrashRequest → 系統垃圾桶＋系統同意框。
 * - Android 10 以下：本函式直接 throw（呼叫端必須先做 App 內二次確認，改走永久刪除路徑）。
 *
 * 成功只認 OS 明確回報；取消與失敗由呼叫端按 kind / catch code 區分。
 */
export async function moveAssetsToTrash(assetIds: string[]): Promise<TrashOutcome> {
  if (assetIds.length === 0) return { kind: 'cancelled' };
  if (Platform.OS === 'android' && !isSystemTrashAvailable()) {
    const err = new Error('System trash requires Android 11 or higher') as Error & { code?: string };
    err.code = 'ERR_TRASH_UNSUPPORTED';
    throw err;
  }
  if (Platform.OS === 'android') {
    // Android 的 assetId 即 contentUri，可直接傳給 trash request
    const result = await trashAssets(assetIds);
    if (result.status === 'trashed') return { kind: 'trashed', count: assetIds.length };
    return { kind: 'cancelled' };
  }
  await Asset.delete(assetIds.map((id) => new Asset(id)));
  return { kind: 'trashed', count: assetIds.length };
}

/**
 * 最後手段：永久刪除（僅 Android 10 以下，且呼叫前必須已有 App 內二次確認）。
 * 正常路徑永遠不該走到這裡。
 */
export async function permanentlyDeleteAssets(assetIds: string[]): Promise<number> {
  await Asset.delete(assetIds.map((id) => new Asset(id)));
  return assetIds.length;
}
