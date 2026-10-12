import {
  Album,
  Asset,
  AssetField,
  MediaType,
  Query,
  getPermissionsAsync,
  requestPermissionsAsync,
  type PermissionResponse,
} from 'expo-media-library';
import type { ClassifyItem, SortOrder, SourceAlbum, TargetAlbum } from '@/types';

export async function ensureReadPermission(): Promise<PermissionResponse> {
  const current = await getPermissionsAsync();
  if (current.granted || current.accessPrivileges === 'limited') return current;
  return requestPermissionsAsync();
}

export function isLimitedAccess(resp: PermissionResponse | null): boolean {
  return resp?.accessPrivileges === 'limited';
}

/** 頂部來源相簿清單：「所有照片」+ 系統/使用者相簿 */
export async function listSourceAlbums(): Promise<SourceAlbum[]> {
  const albums = await Album.getAll();
  const out: SourceAlbum[] = [{ id: null, title: '所有照片' }];
  for (const album of albums) {
    const title = await album.getTitle();
    out.push({ id: album.id, title });
  }
  // 常見來源優先：相機、螢幕截圖（若存在）
  const priority = ['相機', 'Camera', '相機膠卷', '螢幕截圖', 'Screenshots'];
  out.sort((a, b) => {
    if (a.id === null) return -1;
    if (b.id === null) return 1;
    const ai = priority.findIndex((p) => a.title.includes(p));
    const bi = priority.findIndex((p) => b.title.includes(p));
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.title.localeCompare(b.title, 'zh-Hant');
  });
  return out;
}

/** 底部目標相簿：排除目前來源相簿本身，避免「整理卻沒動」的誤解 */
export async function listTargetAlbums(excludeAlbumId: string | null): Promise<TargetAlbum[]> {
  const albums = await Album.getAll();
  const out: TargetAlbum[] = [];
  for (const album of albums) {
    if (excludeAlbumId !== null && album.id === excludeAlbumId) continue;
    out.push({ id: album.id, title: await album.getTitle() });
  }
  return out;
}

export async function createTargetAlbum(title: string): Promise<TargetAlbum> {
  const album = await Album.create(title.trim(), []);
  return { id: album.id, title: await album.getTitle() };
}

export interface PhotoPage {
  items: ClassifyItem[];
  hasMore: boolean;
}

const PAGE_SIZE = 30;

/**
 * 分頁讀取照片。SDK 57 新 API 以 Query + orderBy 取代舊 getAssetsAsync。
 * 注意：offset 需由呼叫端累加；已分類過的 assetId 由 session 層過濾。
 */
export async function getPhotoPage(
  source: SourceAlbum,
  offset: number,
  sortOrder: SortOrder,
  limit: number = PAGE_SIZE,
): Promise<PhotoPage> {
  let query = new Query()
    .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
    .orderBy({ key: AssetField.CREATION_TIME, ascending: sortOrder === 'oldest' })
    .limit(limit)
    .offset(offset);

  if (source.id !== null) {
    query = query.album(new Album(source.id));
  }
  const assets: Asset[] = await query.exe();
  const items: ClassifyItem[] = [];
  for (const asset of assets) {
    const [uri, width, height, creationTime] = await Promise.all([
      asset.getUri(),
      asset.getWidth(),
      asset.getHeight(),
      asset.getCreationTime(),
    ]);
    items.push({ assetId: asset.id, uri, width, height, creationTime });
  }
  return { items, hasMore: assets.length >= limit };
}

/**
 * 依系統照片識別碼取回單張（P3 撤銷恢復用：被撤銷的照片可能不在目前 queue）。
 * 讀不到（如系統中已刪除）回傳 null，呼叫端應視為單純取消決定。
 */
export async function getItemById(assetId: string): Promise<ClassifyItem | null> {
  try {
    const asset = new Asset(assetId);
    const [uri, width, height, creationTime] = await Promise.all([
      asset.getUri(),
      asset.getWidth(),
      asset.getHeight(),
      asset.getCreationTime(),
    ]);
    return { assetId, uri, width, height, creationTime };
  } catch {
    return null;
  }
}

/**
 * P6 套用階段使用：
 * - 分類 = album.add(assets)：iOS 為加入成員關係；Android 視 MediaStore 實作搬移/歸屬。
 * - 刪除 = Asset.delete(assets)：走系統垃圾桶/最近刪除，由 OS 要求使用者確認。
 * 兩者不可視為單一原子交易，呼叫端需逐筆記錄成功/失敗。
 */
export async function applyAddToAlbum(albumId: string, assetIds: string[]): Promise<void> {
  const album = new Album(albumId);
  const assets = assetIds.map((id) => new Asset(id));
  await album.add(assets);
}

export async function applyMoveToTrash(assetIds: string[]): Promise<void> {
  await Asset.delete(assetIds.map((id) => new Asset(id)));
}
