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

/**
 * 正規化檔案 URI，確保 Android 能夠正確讀取（修正 file:/ 與缺少的 file:// scheme）。
 */
export function sanitizeFileUri(uri: string): string {
  if (!uri) return '';
  const trimmed = uri.trim();
  if (trimmed.startsWith('file:///')) return trimmed;
  if (trimmed.startsWith('file:/')) return trimmed.replace(/^file:\/+/, 'file:///');
  if (trimmed.startsWith('/')) return `file://${trimmed}`;
  return trimmed;
}

/**
 * 將 assetId 轉為標準 MediaStore content:// URI（若是純數字 ID 自動補足路徑）。
 */
export function toContentUri(assetId: string, mediaType?: 'image' | 'video' | string): string {
  if (assetId.startsWith('content://')) {
    return assetId;
  }
  if (/^\d+$/.test(assetId.trim())) {
    const typeSegment = mediaType === 'video' ? 'video' : 'images';
    return `content://media/external/${typeSegment}/media/${assetId.trim()}`;
  }
  return assetId;
}

/**
 * 取得雙層可用 URI：
 * 1. fileUri: 本機直接檔案路徑（如 file:///storage/emulated/0/...），在 Android 上讀取效能最好、無 IPC 開銷。
 * 2. contentUri: MediaStore 官方 URI（content://media/external/images/media/...），Scoped Storage 官方標準。
 * 優先使用乾淨的 fileUri；若無 fileUri（如某些編輯過的照片系統未暴露 DATA 路徑）或失敗時，使用 contentUri。
 */
export function resolveUris(
  assetId: string,
  storedUri: string,
  mediaType?: 'image' | 'video' | string,
): { uri: string; fallbackUri?: string } {
  const contentUri = toContentUri(assetId, mediaType);
  const cleanStored = sanitizeFileUri(storedUri);

  // 若有有效的 file:// 路徑，優先以直接檔案讀取（Glide 本機讀取最穩定），content:// 作為 fallback
  if (cleanStored && cleanStored.startsWith('file://')) {
    return {
      uri: cleanStored,
      fallbackUri: contentUri && contentUri !== cleanStored ? contentUri : undefined,
    };
  }

  // 若無實體檔案路徑（例如部分編輯後的照片或純雲端串流），以 contentUri 為主
  return {
    uri: contentUri || cleanStored,
    fallbackUri: cleanStored && cleanStored !== contentUri ? cleanStored : undefined,
  };
}

export async function ensureReadPermission(): Promise<PermissionResponse> {
  const current = await getPermissionsAsync();
  if (current.granted || current.accessPrivileges === 'limited') return current;
  return requestPermissionsAsync();
}

export function isLimitedAccess(resp: PermissionResponse | null): boolean {
  return resp?.accessPrivileges === 'limited';
}

/**
 * 根目錄 DCIM / DICM 判斷：
 * 在三星及 Android 系統中，DCIM 為儲存相片與影片的根目錄（如 /sdcard/DCIM/），
 * 真正的相簿（如 Camera/相機、Screenshots/螢幕截圖 等）位於其內部子資料夾。
 * 若系統 MediaStore 回傳標題為 DCIM 或 DICM 本身，不可將其視為單一相簿資料夾，
 * 否則抓取只會抓到根目錄散落檔案，無法看到內部相簿的全部相片與影片。
 */
export function isRootDcim(title: string | null | undefined): boolean {
  if (!title) return false;
  return /^dci?m$/i.test(title.trim());
}

/**
 * 常見媒體相簿判斷（輔助優先排序用，不再用於過濾阻擋使用者相簿）
 */
const COMMON_MEDIA_ALBUMS =
  /camera|相機|膠卷|screenshot|screen.?shot|screen.?record|螢幕錄影|錄影|截圖|pictures?|照片|圖片|download|下載|video|影片/i;

export function isCommonMediaAlbum(title: string): boolean {
  const trimmed = title.trim();
  if (isRootDcim(trimmed)) return false;
  return COMMON_MEDIA_ALBUMS.test(trimmed);
}

/** 頂部來源相簿清單：「所有相片與影片」+ 系統/使用者相簿（包含 DCIM 內全部子資料夾與媒體相簿） */
export async function listSourceAlbums(_showAll?: boolean): Promise<SourceAlbum[]> {
  const albums = await Album.getAll();
  const withTitles = await Promise.all(
    albums.map(async (album) => {
      try {
        const title = await album.getTitle();
        return { album, title };
      } catch {
        return null;
      }
    }),
  );
  // 「所有相片與影片」放在首位，代表全機與 DCIM 內全部相片與影片
  const out: SourceAlbum[] = [{ id: null, title: '所有相片與影片' }];
  const candidates = (withTitles.filter((x) => x !== null) as { album: Album; title: string }[]).filter(
    ({ title }) => {
      const trimmed = title.trim();
      return trimmed.length > 0 && !isRootDcim(trimmed);
    },
  );
  const checks = await Promise.all(
    candidates.map(async ({ album, title }) => {
      const trimmed = title.trim();
      // 純語音/錄音/音樂資料夾若沒有照片/影片才排除，其餘相簿一律保留
      if (/voice|recorder|music|錄音|音樂|audio|播客|podcast/i.test(trimmed)) {
        const keep = await albumHasMedia(album.id);
        if (!keep) return null;
      }
      return { id: album.id, title: trimmed };
    }),
  );
  for (const c of checks) {
    if (c) out.push(c);
  }
  // 常見來源優先：相機、螢幕截圖、螢幕錄影、圖片、下載等，其餘依名稱排序（如 DCIM 內全部使用者相簿）
  const priority = [
    '相機',
    'Camera',
    '相機膠卷',
    '螢幕截圖',
    'Screenshots',
    'Screens',
    '截圖',
    '螢幕錄影',
    'Screen recordings',
    'Videos',
    '影片',
    'Pictures',
    '照片',
    '圖片',
    'Download',
    '下載',
  ];
  out.sort((a, b) => {
    if (a.id === null) return -1;
    if (b.id === null) return 1;
    const ai = priority.findIndex((p) => a.title.toLowerCase().includes(p.toLowerCase()));
    const bi = priority.findIndex((p) => b.title.toLowerCase().includes(p.toLowerCase()));
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.title.localeCompare(b.title, 'zh-Hant');
  });
  return out;
}

/** 系統智慧相簿（不可作為分類目標）：最近刪除/垃圾桶/已隱藏等，加入會失敗 */
const NON_WRITABLE_TARGET = /最近刪除|recently deleted|垃圾桶|^trash$|已隱藏|^hidden$|已封存/i;

/** 單一相簿是否至少含一張照片或影片；失敗時 fail-open（保留），避免整列消失 */
export async function albumHasMedia(albumId: string): Promise<boolean> {
  try {
    const assets = await new Query()
      .album(new Album(albumId))
      .within(AssetField.MEDIA_TYPE, [MediaType.IMAGE, MediaType.VIDEO])
      .limit(1)
      .exe();
    return assets.length > 0;
  } catch {
    return true;
  }
}
export const albumHasImages = albumHasMedia;

/** 下滑查看用：這張照片目前被系統放在哪些相簿裡（Android 通常只有一個） */
export async function getAssetAlbumTitles(assetId: string): Promise<string[]> {
  try {
    const asset = new Asset(assetId);
    const albums = await asset.getAlbums();
    const titles = await Promise.all(
      albums.map(async (a) => {
        try {
          return await a.getTitle();
        } catch {
          return null;
        }
      }),
    );
    // 排除 DCIM 根目錄本身
    return titles.filter((t): t is string => !!t && t.trim().length > 0 && !isRootDcim(t));
  } catch {
    return [];
  }
}

/** 底部目標相簿：排除目前來源相簿本身與 DCIM 根目錄，包含手機中所有相簿（DCIM 內子資料夾與使用者相簿） */
export async function listTargetAlbums(
  excludeAlbumId: string | null,
  _showAll?: boolean,
): Promise<TargetAlbum[]> {
  const albums = await Album.getAll();
  const withTitles = await Promise.all(
    albums.map(async (album) => {
      try {
        if (excludeAlbumId !== null && album.id === excludeAlbumId) return null;
        const title = await album.getTitle();
        return { album, title };
      } catch {
        return null;
      }
    }),
  );
  const candidates = (withTitles.filter((x) => x !== null) as { album: Album; title: string }[]).filter(
    ({ title }) => {
      const trimmed = title.trim();
      return (
        trimmed.length > 0 &&
        !isRootDcim(trimmed) && // 排除 DCIM 根目錄本身
        !NON_WRITABLE_TARGET.test(trimmed)
      );
    },
  );
  const checks = await Promise.all(
    candidates.map(async ({ album, title }) => {
      const trimmed = title.trim();
      // 只有明確是純音訊資料夾才排除，其餘相簿一律保留
      if (/voice|recorder|music|錄音|音樂|audio|播客|podcast/i.test(trimmed)) {
        const keep = await albumHasMedia(album.id);
        if (!keep) return null;
      }
      return { id: album.id, title: trimmed };
    }),
  );
  const out: TargetAlbum[] = [];
  for (const c of checks) {
    if (c) out.push(c);
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
 * 分頁讀取相片與影片。SDK 57 新 API 以 Query + orderBy 取代舊 getAssetsAsync。
 * 注意：offset 需由呼叫端累加；已分類過的 assetId 由 session 層過濾。
 */
export async function getPhotoPage(
  source: SourceAlbum,
  offset: number,
  sortOrder: SortOrder,
  limit: number = PAGE_SIZE,
): Promise<PhotoPage> {
  let query = new Query()
    .within(AssetField.MEDIA_TYPE, [MediaType.IMAGE, MediaType.VIDEO])
    .orderBy({ key: AssetField.CREATION_TIME, ascending: sortOrder === 'oldest' })
    .limit(limit)
    .offset(offset);

  if (source.id !== null) {
    query = query.album(new Album(source.id));
  }
  const assets: Asset[] = await query.exe();
  const items: ClassifyItem[] = [];
  for (const asset of assets) {
    const [storedUri, width, height, creationTime, mediaType, duration] = await Promise.all([
      asset.getUri().catch(() => ''),
      asset.getWidth().catch(() => 0),
      asset.getHeight().catch(() => 0),
      asset.getCreationTime().catch(() => null),
      asset.getMediaType().catch(() => MediaType.IMAGE),
      asset.getDuration().catch(() => 0),
    ]);
    const isVideo = mediaType === MediaType.VIDEO;
    const { uri, fallbackUri } = resolveUris(asset.id, storedUri, isVideo ? 'video' : 'image');
    if (!uri) continue;
    items.push({
      assetId: asset.id,
      uri,
      fallbackUri,
      width,
      height,
      creationTime,
      mediaType: isVideo ? 'video' : 'image',
      duration: duration ?? 0,
    });
  }
  return { items, hasMore: assets.length >= limit };
}

/**
 * 依系統識別碼取回單張（P3 撤銷恢復用：被撤銷的照片可能不在目前 queue）。
 * 讀不到（如系統中已刪除）回傳 null，呼叫端應視為單純取消決定。
 */
export async function getItemById(assetId: string): Promise<ClassifyItem | null> {
  try {
    const asset = new Asset(assetId);
    const [storedUri, width, height, creationTime, mediaType, duration] = await Promise.all([
      asset.getUri().catch(() => ''),
      asset.getWidth().catch(() => 0),
      asset.getHeight().catch(() => 0),
      asset.getCreationTime().catch(() => null),
      asset.getMediaType().catch(() => MediaType.IMAGE),
      asset.getDuration().catch(() => 0),
    ]);
    const isVideo = mediaType === MediaType.VIDEO;
    const { uri, fallbackUri } = resolveUris(assetId, storedUri, isVideo ? 'video' : 'image');
    if (!uri) return null;
    return {
      assetId,
      uri,
      fallbackUri,
      width,
      height,
      creationTime,
      mediaType: isVideo ? 'video' : 'image',
      duration: duration ?? 0,
    };
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
