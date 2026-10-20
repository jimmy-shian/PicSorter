import type * as SQLite from 'expo-sqlite';
import { Album } from 'expo-media-library';
import { applyAddToAlbum } from '@/lib/media';
import { moveAssetsToTrash, permanentlyDeleteAssets } from '@/lib/trash';
import { finishSession, getPref, setPref } from '@/lib/db';

/**
 * P6 套用管線（規格 §3.4）：把待執行紀錄真正寫入系統。
 *
 * 不可違反的規則：
 * 1. applied=1 只在 OS 明確回報成功後寫；其他一律不算完成（驗收 #14）。
 * 2. 使用者取消（自繪確認或 OS 同意框）记「未完成」，不记 failed。
 * 3. 分類與垃圾桶不是原子交易：相簿成功不因垃圾桶取消而回滾。
 * 4. 冪等：永遠只取 applied=0 的列，中途被殺掉重跑也安全。
 */

export const ALBUM_BATCH_SIZE = 20;

export type ApplyPhase = 'verify' | 'album' | 'trash' | 'done';

export interface ApplyProgress {
  done: number;
  total: number;
  phase: ApplyPhase;
  /** 正在處理的相簿名稱（album 階段） */
  label: string | null;
}

export interface ApplySummary {
  perAlbum: { albumId: string; title: string; pending: number }[];
  trashPending: number;
  appliedAlbum: number;
  appliedTrash: number;
  failedCount: number;
  failedItems: { assetId: string; uri: string | null; reason: string | null }[];
  pendingCount: number;
}

export interface ApplyResult {
  appliedAlbum: number;
  appliedTrash: number;
  pendingCount: number;
}

interface PendingRow {
  asset_id: string;
  action: string;
  target_album_id: string | null;
  target_album_title: string | null;
}

export interface RunApplyOptions {
  onProgress?: (p: ApplyProgress) => void;
  /** 每批之間檢查；回傳 true 即停，剩餘保持未套用 */
  isCancelled?: () => boolean;
  /**
   * 垃圾桶閘門（UI 層實作，含平台正確文案與舊機二次確認）。
   * - 'trash'：走系統垃圾桶（Android 11+）或最近刪除（iOS）
   * - 'permanent'：僅 Android 10 以下，UI 已做二次確認，走永久刪除
   * - 'skip'：trash 全部保留未套用
   */
  requestTrashConfirm?: (count: number) => Promise<'trash' | 'permanent' | 'skip'>;
  /** 相簿移動確認：可設定整批一次或每個相簿一次。 */
  albumConfirmMode?: 'once' | 'each';
  requestAlbumConfirm?: (count: number, albumTitle: string | null, albumCount: number) => Promise<boolean>;
}

function errText(e: unknown): string {
  if (e instanceof Error) return e.message || String(e);
  return String(e);
}

/** 把原生錯誤分成：使用者取消 / 目標缺失 / 其他失敗 */
export function classifyApplyError(e: unknown): { kind: 'cancelled' | 'missing' | 'failed'; message: string } {
  const msg = errText(e);
  const code = (e as { code?: unknown })?.code;
  const hay = `${String(code ?? '')} ${msg}`;
  if (/didn't grant|did not grant|E_NO_PERMISSIONS|FailedToGrantPermissions|cancelled|canceled|ERR_TRASH.*CANCEL/i.test(hay)) {
    return { kind: 'cancelled', message: '使用者未確認' };
  }
  if (/not found|does not exist|may have been deleted|AlbumNotFound|AssetNotFound|CouldNotBeAdded/i.test(hay)) {
    return { kind: 'missing', message: '相簿或照片已不存在' };
  }
  return { kind: 'failed', message: msg.length > 120 ? `${msg.slice(0, 120)}…` : msg };
}

async function getPending(db: SQLite.SQLiteDatabase, sessionId: string): Promise<PendingRow[]> {
  return db.getAllAsync<PendingRow>(
    `SELECT asset_id, action, target_album_id, target_album_title FROM decisions
     WHERE session_id = ? AND applied = 0 AND action IN ('album', 'trash')`,
    sessionId,
  );
}

async function markApplied(db: SQLite.SQLiteDatabase, sessionId: string, assetIds: string[]): Promise<void> {
  const placeholders = assetIds.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE decisions SET applied = 1, failed = 0, last_error = NULL WHERE session_id = ? AND asset_id IN (${placeholders})`,
    sessionId,
    ...assetIds,
  );
}

async function markFailed(db: SQLite.SQLiteDatabase, sessionId: string, assetIds: string[], reason: string): Promise<void> {
  const placeholders = assetIds.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE decisions SET failed = failed + 1, last_error = ? WHERE session_id = ? AND asset_id IN (${placeholders})`,
    reason,
    sessionId,
    ...assetIds,
  );
}

/** 摘要（確認頁與結果頁共用）：只讀 applied=0 的待辦 + 已套用/失敗計數 */
export async function getApplySummary(db: SQLite.SQLiteDatabase, sessionId: string): Promise<ApplySummary> {
  const pending = await getPending(db, sessionId);
  const byAlbum = new Map<string, { title: string; pending: number }>();
  let trashPending = 0;
  for (const r of pending) {
    if (r.action === 'album' && r.target_album_id) {
      const prev = byAlbum.get(r.target_album_id) ?? { title: r.target_album_title ?? r.target_album_id, pending: 0 };
      prev.pending += 1;
      byAlbum.set(r.target_album_id, prev);
    } else if (r.action === 'trash') {
      trashPending += 1;
    }
  }
  const appliedAlbum =
    (await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM decisions WHERE session_id = ? AND applied = 1 AND action = 'album'",
      sessionId,
    ))?.n ?? 0;
  const appliedTrash =
    (await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM decisions WHERE session_id = ? AND applied = 1 AND action = 'trash'",
      sessionId,
    ))?.n ?? 0;
  const failedItems = await db.getAllAsync<{ assetId: string; uri: string | null; reason: string | null }>(
    'SELECT asset_id AS assetId, uri, last_error AS reason FROM decisions WHERE session_id = ? AND applied = 0 AND failed > 0',
    sessionId,
  );
  return {
    perAlbum: [...byAlbum.entries()].map(([albumId, v]) => ({ albumId, ...v })),
    trashPending,
    appliedAlbum,
    appliedTrash,
    failedCount: failedItems.length,
    failedItems,
    pendingCount: pending.length,
  };
}

export async function runApplyPipeline(
  db: SQLite.SQLiteDatabase,
  sessionId: string,
  opts: RunApplyOptions = {},
): Promise<ApplyResult> {
  const onProgress = opts.onProgress ?? (() => {});
  const isCancelled = opts.isCancelled ?? (() => false);
  const report = (done: number, total: number, phase: ApplyPhase, label: string | null) =>
    onProgress({ done, total, phase, label });

  const pending = await getPending(db, sessionId);
  const albumRows = pending.filter((r) => r.action === 'album' && r.target_album_id);
  const trashRows = pending.filter((r) => r.action === 'trash');
  const total = albumRows.length + trashRows.length;
  let done = 0;
  let appliedAlbum = 0;
  let appliedTrash = 0;

  // ── 1. 存在性預檢：目標相簿是否還在（一次 getAll，不逐張打擾系統）──
  report(0, total, 'verify', null);
  const liveAlbums = new Map<string, string>();
  try {
    for (const a of await Album.getAll()) liveAlbums.set(a.id, await a.getTitle());
  } catch {
    // 查不到就當全部還在，交給逐批錯誤處理
  }
  const byAlbum = new Map<string, PendingRow[]>();
  for (const r of albumRows) {
    const id = r.target_album_id as string;
    const isVirtual = id.startsWith('virtual:');
    if (!isVirtual && liveAlbums.size > 0 && !liveAlbums.has(id)) {
      await markFailed(db, sessionId, [r.asset_id], '目標相簿已不存在');
      done += 1;
      report(done, total, 'verify', r.target_album_title);
      continue;
    }
    const list = byAlbum.get(id) ?? [];
    list.push(r);
    byAlbum.set(id, list);
  }
  if (isCancelled()) return finish(db, sessionId, appliedAlbum, appliedTrash);

  // ── 2. 相簿分類：分組分批，先整批、失敗降級逐筆 ──
  let albumConfirmAsked = false;
  let albumConfirmAllowed = true;
  for (const [albumId, rows] of byAlbum) {
    const title = liveAlbums.get(albumId) ?? rows[0]?.target_album_title ?? albumId;
    let activeAlbumId = albumId;
    if (opts.albumConfirmMode !== 'each' && !albumConfirmAllowed) continue;
    if (opts.requestAlbumConfirm && (opts.albumConfirmMode === 'each' || !albumConfirmAsked)) {
      const allowed = await opts.requestAlbumConfirm(
        opts.albumConfirmMode === 'each' ? rows.length : albumRows.length,
        opts.albumConfirmMode === 'each' ? title : null,
        byAlbum.size,
      );
      albumConfirmAsked = true;
      if (!allowed) {
        albumConfirmAllowed = false;
        continue;
      }
    }
    for (let i = 0; i < rows.length; i += ALBUM_BATCH_SIZE) {
      if (isCancelled()) return finish(db, sessionId, appliedAlbum, appliedTrash);
      const batch = rows.slice(i, i + ALBUM_BATCH_SIZE);
      const ids = batch.map((r) => r.asset_id);
      report(done, total, 'album', title);
      try {
        const realId = await applyAddToAlbum(activeAlbumId, ids, title);
        if (activeAlbumId.startsWith('virtual:') && realId && !realId.startsWith('virtual:')) {
          await db.runAsync('UPDATE album_order SET album_id = ? WHERE album_id = ?', realId, activeAlbumId);
          await db.runAsync('UPDATE decisions SET target_album_id = ? WHERE target_album_id = ?', realId, activeAlbumId);
          const up = await getPref(db, 'up_target_id');
          if (up === activeAlbumId) await setPref(db, 'up_target_id', realId);
          const down = await getPref(db, 'down_target_id');
          if (down === activeAlbumId) await setPref(db, 'down_target_id', realId);
          activeAlbumId = realId;
        }
        await markApplied(db, sessionId, ids);
        appliedAlbum += ids.length;
        done += ids.length;
      } catch (batchErr) {
        void batchErr;
        // 降級逐筆：成功標成功，失敗只記該筆（部分成功不 whole-batch 失敗）
        for (const id of ids) {
          if (isCancelled()) break;
          try {
            const realId = await applyAddToAlbum(activeAlbumId, [id], title);
            if (activeAlbumId.startsWith('virtual:') && realId && !realId.startsWith('virtual:')) {
              await db.runAsync('UPDATE album_order SET album_id = ? WHERE album_id = ?', realId, activeAlbumId);
              await db.runAsync('UPDATE decisions SET target_album_id = ? WHERE target_album_id = ?', realId, activeAlbumId);
              activeAlbumId = realId;
            }
            await markApplied(db, sessionId, [id]);
            appliedAlbum += 1;
          } catch (itemErr) {
            const c = classifyApplyError(itemErr);
            if (c.kind !== 'cancelled') {
              await markFailed(db, sessionId, [id], c.message);
            }
            // cancelled 罕見（add 無系統框）：當未完成，不記 failed
          } finally {
            done += 1;
            report(done, total, 'album', title);
          }
        }
      }
      report(done, total, 'album', title);
    }
  }
  if (isCancelled()) return finish(db, sessionId, appliedAlbum, appliedTrash);

  // ── 3+4. 垃圾桶閘門：先問人（自繪確認），再問 OS（系統同意框）──
  if (trashRows.length > 0) {
    report(done, total, 'trash', null);
    const choice = opts.requestTrashConfirm ? await opts.requestTrashConfirm(trashRows.length) : 'skip';
    if (choice !== 'skip' && !isCancelled()) {
      const ids = trashRows.map((r) => r.asset_id);
      try {
        if (choice === 'permanent') {
          // 僅 Android 10 以下：UI 已做二次確認，走永久刪除
          const n = await permanentlyDeleteAssets(ids);
          await markApplied(db, sessionId, ids);
          appliedTrash += n;
        } else {
          const outcome = await moveAssetsToTrash(ids);
          if (outcome.kind === 'trashed') {
            await markApplied(db, sessionId, ids);
            appliedTrash += outcome.count;
          }
          // cancelled → 全部保留未套用，不記 failed
        }
      } catch (e) {
        const err = e as Error & { code?: string };
        if (err?.code === 'ERR_TRASH_UNSUPPORTED') {
          // 閘門不應放行舊機；萬一發生，保守記失敗並寫明，不擅自永久刪除
          await markFailed(db, sessionId, ids, '此系統不支援垃圾桶，請更新系統後重試');
        } else {
          const c = classifyApplyError(e);
          if (c.kind !== 'cancelled') {
            await markFailed(db, sessionId, ids, c.message);
          }
          // 使用者未確認：未完成，不記 failed
        }
      } finally {
        const stillPending = (await getPending(db, sessionId)).length;
        done = total - stillPending;
        report(done, total, 'trash', null);
      }
    }
  }

  return finish(db, sessionId, appliedAlbum, appliedTrash);
}

async function finish(db: SQLite.SQLiteDatabase, sessionId: string, appliedAlbum: number, appliedTrash: number): Promise<ApplyResult> {
  const pendingCount =
    (await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM decisions WHERE session_id = ? AND applied = 0',
      sessionId,
    ))?.n ?? 0;
  // 全部完成才結案；有任何未完成（含 trash 未確認）一律保持 open
  if (pendingCount === 0) await finishSession(db, sessionId);
  return { appliedAlbum, appliedTrash, pendingCount };
}
