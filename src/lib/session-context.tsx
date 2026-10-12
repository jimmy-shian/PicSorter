import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import type { ClassifyItem, DecisionAction, SortOrder, SourceAlbum, TargetAlbum } from '@/types';
import { newSessionId } from '@/lib/db';
import {
  abandonEmptySessions,
  abandonSession,
  getLatestOpenSession,
  getSessionDecisions,
  getSessionRow,
  type DecisionRow,
} from '@/lib/db';
import { getPhotoPage, getItemById, listTargetAlbums } from '@/lib/media';
import { ensureOrderRows, getAlbumEntries } from '@/lib/album-order';
import {
  runApplyPipeline,
  type ApplyProgress,
  type ApplyResult,
} from '@/lib/apply';

export interface RunApplyOpts {
  onProgress?: (p: ApplyProgress) => void;
  isCancelled?: () => boolean;
  requestTrashConfirm?: () => Promise<'trash' | 'permanent' | 'skip'>;
}

export interface Decision {
  assetId: string;
  action: DecisionAction;
  targetAlbumId: string | null;
  targetAlbumTitle: string | null;
  /** 縮圖顯示用（P5 存入 DB，舊列由 backfill 補齊） */
  uri: string | null;
  width: number | null;
  height: number | null;
  /** P6 套用狀態：applied 後凍結 undo/update/remove（由管線重建 Map） */
  applied: boolean;
  failed: number;
  lastError: string | null;
}

export type BootState = 'idle' | 'checking' | 'choice' | 'ready';

export interface PendingResume {
  sessionId: string;
  sourceTitle: string;
  processed: number;
  trash: number;
  createdAt: number;
}

interface SessionState {
  boot: BootState;
  pendingResume: PendingResume | null;
  startBoot: () => Promise<void>;
  chooseResume: () => Promise<void>;
  chooseFresh: () => Promise<void>;
  /** 設定頁「進行中的整理」由此回到某個工作 */
  resumeSession: (id: string) => Promise<boolean>;
  /** 清除紀錄後重建目前來源的新工作，避免寫入孤兒列 */
  restartFresh: () => Promise<void>;
  sessionId: string | null;
  source: SourceAlbum;
  sortOrder: SortOrder;
  queue: ClassifyItem[];
  index: number;
  current: ClassifyItem | null;
  positionLabel: string;
  hasMore: boolean;
  loading: boolean;
  limitedAccess: boolean;
  targets: TargetAlbum[];
  selectedTargetId: string | null;
  decisions: Map<string, Decision>;
  trashCount: number;
  processedCount: number;
  canUndo: boolean;
  setSource: (s: SourceAlbum) => void;
  setSortOrder: (o: SortOrder) => void;
  setLimitedAccess: (b: boolean) => void;
  selectTarget: (id: string) => void;
  refreshTargets: () => Promise<void>;
  addTarget: (t: TargetAlbum) => Promise<void>;
  classifyCurrent: (action: DecisionAction, targetId?: string) => Promise<boolean>;
  undo: () => Promise<void>;
  loadMore: () => Promise<void>;
  /**
   * P6 套用（只改待執行紀錄，不動系統）：
   * - updateDecisions：重新分類 / 改為待刪除（同批套用相同目標）
   * - removeDecisions：移除本次分類或取消刪除，照片插回待處理列
   * 檢查頁的編輯會將涉及照片移出撤銷鏈，避免撤銷語意混亂。
   * 已 applied 的列一律拒絕異動（SQL 與記憶體雙守衛）。
   */
  updateDecisions: (
    assetIds: string[],
    patch: { action: DecisionAction; targetAlbumId?: string | null },
  ) => Promise<void>;
  removeDecisions: (assetIds: string[]) => Promise<void>;
  /** 舊決定列缺 uri 時補齊；系統中已消失的照片順手清掉幽靈決定 */
  backfillMissingUris: () => Promise<void>;
  /**
   * P6 執行套用管線：跑完後從 DB 重建 decisions（含 applied/failed），
   * 並清空撤銷歷史（已套用不可撤銷；未套用的歷史也因順序失真而凍結）。
   */
  runApply: (opts: RunApplyOpts) => Promise<ApplyResult>;
}

const SessionContext = createContext<SessionState | null>(null);

const DEFAULT_SOURCE: SourceAlbum = { id: null, title: '所有照片' };
const FIRST_BATCH = 12;
const PAGE_SIZE = 30;

function toDecision(r: DecisionRow): Decision {
  return {
    assetId: r.asset_id,
    action: r.action === 'trash' ? 'trash' : 'album',
    targetAlbumId: r.target_album_id,
    targetAlbumTitle: r.target_album_title,
    uri: r.uri ?? null,
    width: r.width ?? null,
    height: r.height ?? null,
    applied: (r.applied ?? 0) === 1,
    failed: r.failed ?? 0,
    lastError: r.last_error ?? null,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [boot, setBoot] = useState<BootState>('idle');
  const [pendingResume, setPendingResume] = useState<PendingResume | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [source, setSourceState] = useState<SourceAlbum>(DEFAULT_SOURCE);
  const [sortOrder, setSortOrderState] = useState<SortOrder>('newest');
  const [queue, setQueue] = useState<ClassifyItem[]>([]);
  const [index, setIndex] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [limitedAccess, setLimitedAccess] = useState(false);
  const [targets, setTargets] = useState<TargetAlbum[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Map<string, Decision>>(new Map());

  const sessionRef = useRef<string | null>(null);
  const sourceRef = useRef<SourceAlbum>(DEFAULT_SOURCE);
  const sortOrderRef = useRef<SortOrder>('newest');
  const historyRef = useRef<string[]>([]);
  const offsetRef = useRef(0);
  const reqIdRef = useRef(0);
  const bootRef = useRef<BootState>('idle');
  /** queue/index 的 ref 鏡像：撤銷恢復等非同步流程需要讀取最新值，避免閉包過期 */
  const queueRef = useRef<ClassifyItem[]>([]);
  const indexRef = useRef(0);
  const undoLockRef = useRef(false);

  const setBootState = useCallback((b: BootState) => {
    bootRef.current = b;
    setBoot(b);
  }, []);

  const loadTargets = useCallback(
    async (excludeAlbumId: string | null) => {
      // P4：系統相簿套用本機自訂順序（固定→一般，隱藏的不顯示）
      const live = await listTargetAlbums(excludeAlbumId);
      const { visible } = await getAlbumEntries(db, live);
      const list: TargetAlbum[] = visible.map((e) => ({ id: e.id, title: e.title }));
      setTargets(list);
      setSelectedTargetId((prev) => {
        if (prev && list.some((t) => t.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    },
    [db],
  );

  /**
   * 開啟一個工作：新建（寫入 sessions 列）或接手既有（恢復決定）。
   * 首屏持續翻頁直到湊滿一批未處理照片，恢復時已決定的會被跳過。
   */
  const startSession = useCallback(
    async (
      src: SourceAlbum,
      order: SortOrder,
      opts?: { existingId?: string; preloaded?: DecisionRow[] },
    ): Promise<void> => {
      const req = ++reqIdRef.current;
      sourceRef.current = src;
      sortOrderRef.current = order;
      setSourceState(src);
      setSortOrderState(order);
      setLoading(true);
      try {
        let sid = opts?.existingId;
        if (!sid) {
          sid = newSessionId();
          await db.runAsync(
            'INSERT INTO sessions (id, source_album_id, source_album_title, sort_order, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            sid,
            src.id,
            src.title,
            order,
            'open',
            Date.now(),
          );
        }
        if (req !== reqIdRef.current) return;
        sessionRef.current = sid;
        setSessionId(sid);

        const pre = opts?.preloaded ?? [];
        const map = new Map<string, Decision>();
        const hist: string[] = [];
        for (const r of pre) {
          map.set(r.asset_id, toDecision(r));
          hist.push(r.asset_id);
        }
        historyRef.current = hist;
        setDecisions(map);
        setIndex(0);
        indexRef.current = 0;

        void loadTargets(src.id);

        const decidedIds = new Set(map.keys());
        const acc: ClassifyItem[] = [];
        let offset = 0;
        let more = true;
        while (acc.length < FIRST_BATCH && more) {
          const page = await getPhotoPage(src, offset, order, PAGE_SIZE);
          if (req !== reqIdRef.current) return;
          offset += page.items.length;
          more = page.hasMore;
          for (const it of page.items) {
            if (!decidedIds.has(it.assetId)) acc.push(it);
          }
          if (page.items.length === 0) break;
        }
        if (req !== reqIdRef.current) return;
        offsetRef.current = offset;
        queueRef.current = acc;
        setQueue(acc);
        setHasMore(more);
        setBootState('ready');
      } finally {
        if (req === reqIdRef.current) setLoading(false);
      }
    },
    [db, loadTargets, setBootState],
  );

  /** 取得權限後由分類頁呼叫一次：有未完成工作就讓使用者選擇，否則直接開新工作 */
  const startBoot = useCallback(async () => {
    if (bootRef.current !== 'idle') return;
    setBootState('checking');
    try {
      await abandonEmptySessions(db);
      const latest = await getLatestOpenSession(db);
      if (latest && latest.decision_count > 0) {
        setPendingResume({
          sessionId: latest.id,
          sourceTitle: latest.source_album_title,
          processed: latest.decision_count,
          trash: latest.trash_count,
          createdAt: latest.created_at,
        });
        setBootState('choice');
        return;
      }
    } catch {
      // 查詢失敗就當作無進度，直接開新工作
    }
    await startSession(DEFAULT_SOURCE, 'newest');
  }, [db, setBootState, startSession]);

  const chooseResume = useCallback(async () => {
    const p = pendingResume;
    if (!p) {
      await startSession(DEFAULT_SOURCE, 'newest');
      return;
    }
    const row = await getSessionRow(db, p.sessionId);
    if (!row) {
      setPendingResume(null);
      await startSession(DEFAULT_SOURCE, 'newest');
      return;
    }
    const rows = await getSessionDecisions(db, p.sessionId);
    setPendingResume(null);
    await startSession(
      { id: row.source_album_id, title: row.source_album_title },
      row.sort_order === 'oldest' ? 'oldest' : 'newest',
      { existingId: p.sessionId, preloaded: rows },
    );
  }, [db, pendingResume, startSession]);

  const chooseFresh = useCallback(async () => {
    if (pendingResume) {
      await abandonSession(db, pendingResume.sessionId);
    }
    setPendingResume(null);
    await startSession(DEFAULT_SOURCE, 'newest');
  }, [db, pendingResume, startSession]);

  const resumeSession = useCallback(
    async (id: string): Promise<boolean> => {
      const row = await getSessionRow(db, id);
      if (!row) return false;
      const rows = await getSessionDecisions(db, id);
      setPendingResume(null);
      await startSession(
        { id: row.source_album_id, title: row.source_album_title },
        row.sort_order === 'oldest' ? 'oldest' : 'newest',
        { existingId: id, preloaded: rows },
      );
      return true;
    },
    [db, startSession],
  );

  const restartFresh = useCallback(async () => {
    await startSession(sourceRef.current, sortOrderRef.current);
  }, [startSession]);

  const setSource = useCallback(
    (s: SourceAlbum) => {
      if (bootRef.current !== 'ready') return;
      void startSession(s, sortOrderRef.current);
    },
    [startSession],
  );

  const setSortOrder = useCallback(
    (o: SortOrder) => {
      if (bootRef.current !== 'ready') return;
      void startSession(sourceRef.current, o);
    },
    [startSession],
  );

  const selectTarget = useCallback((id: string) => setSelectedTargetId(id), []);

  /** 新增相簿後立即持久化排序列（接在最後），再重載並選為目標 */
  const addTarget = useCallback(
    async (t: TargetAlbum) => {
      await ensureOrderRows(db, [{ id: t.id, title: t.title }]);
      await loadTargets(sourceRef.current.id);
      setSelectedTargetId(t.id);
    },
    [db, loadTargets],
  );

  const refreshTargets = useCallback(async () => {
    await loadTargets(sourceRef.current.id);
  }, [loadTargets]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const page = await getPhotoPage(sourceRef.current, offsetRef.current, sortOrderRef.current, PAGE_SIZE);
      const decided = new Set(decisions.keys());
      const fresh = page.items.filter((it) => !decided.has(it.assetId));
      offsetRef.current += page.items.length;
      const next = [...queueRef.current, ...fresh];
      queueRef.current = next;
      setQueue(next);
      setHasMore(page.hasMore);
    } finally {
      setLoading(false);
    }
  }, [decisions, hasMore, loading]);

  /** 每次分類立即寫入 SQLite（規格 4.1 自動保存），回傳是否成功 */
  const classifyCurrent = useCallback(
    async (action: DecisionAction, targetId?: string): Promise<boolean> => {
      const item = queueRef.current[indexRef.current];
      const sid = sessionRef.current;
      if (!item || !sid) return false;
      if (action === 'album') {
        const tid = targetId ?? selectedTargetId;
        const target = targets.find((t) => t.id === tid);
        if (!target) return false;
        const decision: Decision = {
          assetId: item.assetId,
          action: 'album',
          targetAlbumId: target.id,
          targetAlbumTitle: target.title,
          uri: item.uri,
          width: item.width,
          height: item.height,
          applied: false,
          failed: 0,
          lastError: null,
        };
        await db.runAsync(
          `INSERT INTO decisions (session_id, asset_id, action, target_album_id, target_album_title, created_at, uri, width, height)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(session_id, asset_id) DO UPDATE SET action=excluded.action, target_album_id=excluded.target_album_id, target_album_title=excluded.target_album_title, uri=excluded.uri, width=excluded.width, height=excluded.height`,
          sid,
          item.assetId,
          'album',
          target.id,
          target.title,
          Date.now(),
          item.uri,
          item.width,
          item.height,
        );
        setDecisions((prev) => new Map(prev).set(item.assetId, decision));
        historyRef.current.push(item.assetId);
        indexRef.current += 1;
        setIndex(indexRef.current);
        return true;
      }
      const decision: Decision = {
        assetId: item.assetId,
        action: 'trash',
        targetAlbumId: null,
        targetAlbumTitle: null,
        uri: item.uri,
        width: item.width,
        height: item.height,
        applied: false,
        failed: 0,
        lastError: null,
      };
      await db.runAsync(
        `INSERT INTO decisions (session_id, asset_id, action, target_album_id, target_album_title, created_at, uri, width, height)
         VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?)
         ON CONFLICT(session_id, asset_id) DO UPDATE SET action='trash', target_album_id=NULL, target_album_title=NULL, uri=excluded.uri, width=excluded.width, height=excluded.height`,
        sid,
        item.assetId,
        'trash',
        Date.now(),
        item.uri,
        item.width,
        item.height,
      );
      setDecisions((prev) => new Map(prev).set(item.assetId, decision));
      historyRef.current.push(item.assetId);
      indexRef.current += 1;
      setIndex(indexRef.current);
      return true;
    },
    [db, selectedTargetId, targets],
  );

  const undo = useCallback(async () => {
    if (undoLockRef.current) return;
    const last = historyRef.current.pop();
    const sid = sessionRef.current;
    if (!last || !sid) return;
    undoLockRef.current = true;
    try {
      // 已套用不可撤銷（歷史鏈理論上只含未套用，此為雙保險）
      await db.runAsync('DELETE FROM decisions WHERE session_id = ? AND asset_id = ? AND applied = 0', sid, last);
      setDecisions((prev) => {
        const next = new Map(prev);
        next.delete(last);
        return next;
      });
      // 被撤銷的照片若不在目前 queue（常見於恢復後），把它取回插到当前位置；
      // 若已在 queue（如正常流程），只需退回 index。取不回則單純取消決定。
      const exists = queueRef.current.some((q) => q.assetId === last);
      if (!exists) {
        const restored = await getItemById(last).catch(() => null);
        if (restored) {
          const at = Math.min(indexRef.current, queueRef.current.length);
          const next = [...queueRef.current];
          next.splice(at, 0, restored);
          queueRef.current = next;
          setQueue(next);
          return;
        }
      }
      indexRef.current = Math.max(0, indexRef.current - 1);
      setIndex(indexRef.current);
    } finally {
      undoLockRef.current = false;
    }
  }, [db]);

  const updateDecisions = useCallback(
    async (assetIds: string[], patch: { action: DecisionAction; targetAlbumId?: string | null }) => {
      const sid = sessionRef.current;
      if (!sid || assetIds.length === 0) return;
      let tid: string | null = null;
      let ttitle: string | null = null;
      if (patch.action === 'album') {
        const t = targets.find((x) => x.id === patch.targetAlbumId);
        if (!t) return;
        tid = t.id;
        ttitle = t.title;
      }
      const placeholders = assetIds.map(() => '?').join(',');
      await db.runAsync(
        `UPDATE decisions SET action = ?, target_album_id = ?, target_album_title = ? WHERE session_id = ? AND applied = 0 AND asset_id IN (${placeholders})`,
        patch.action,
        tid,
        ttitle,
        sid,
        ...assetIds,
      );
      const gone = new Set(assetIds);
      historyRef.current = historyRef.current.filter((h) => !gone.has(h));
      setDecisions((prev) => {
        const next = new Map(prev);
        for (const id of assetIds) {
          const cur = next.get(id);
          if (cur && !cur.applied) next.set(id, { ...cur, action: patch.action, targetAlbumId: tid, targetAlbumTitle: ttitle });
        }
        return next;
      });
    },
    [db, targets],
  );

  const removeDecisions = useCallback(
    async (assetIds: string[]) => {
      const sid = sessionRef.current;
      if (!sid || assetIds.length === 0) return;
      // 已套用不可移除：先過濾，剩餘才進 DB 與待處理列
      const targets = assetIds.filter((id) => !decisions.get(id)?.applied);
      if (targets.length === 0) return;
      const placeholders = targets.map(() => '?').join(',');
      await db.runAsync(
        `DELETE FROM decisions WHERE session_id = ? AND applied = 0 AND asset_id IN (${placeholders})`,
        sid,
        ...targets,
      );
      const gone = new Set(targets);
      historyRef.current = historyRef.current.filter((h) => !gone.has(h));
      setDecisions((prev) => {
        const next = new Map(prev);
        for (const id of targets) next.delete(id);
        return next;
      });
      // 回到待處理：插回目前分類位置，返回即可繼續分
      const restored = (
        await Promise.all(targets.map((id) => getItemById(id).catch(() => null)))
      ).filter((x): x is ClassifyItem => x !== null);
      if (restored.length > 0) {
        const at = Math.min(indexRef.current, queueRef.current.length);
        const next = [...queueRef.current];
        next.splice(at, 0, ...restored);
        queueRef.current = next;
        setQueue(next);
      }
    },
    [db, decisions],
  );

  const backfillMissingUris = useCallback(async () => {
    const sid = sessionRef.current;
    if (!sid) return;
    const missing = [...decisions.values()].filter((d) => !d.uri);
    if (missing.length === 0) return;
    const next = new Map(decisions);
    for (const d of missing) {
      const got = await getItemById(d.assetId).catch(() => null);
      if (got) {
        await db.runAsync(
          'UPDATE decisions SET uri = ?, width = ?, height = ? WHERE session_id = ? AND asset_id = ? AND applied = 0',
          got.uri,
          got.width,
          got.height,
          sid,
          d.assetId,
        );
        next.set(d.assetId, { ...d, uri: got.uri, width: got.width, height: got.height });
      } else {
        await db.runAsync('DELETE FROM decisions WHERE session_id = ? AND asset_id = ? AND applied = 0', sid, d.assetId);
        next.delete(d.assetId);
        historyRef.current = historyRef.current.filter((h) => h !== d.assetId);
      }
    }
    setDecisions(next);
  }, [db, decisions]);

  /** 從 DB 重建 decisions 鏡像（套用後同步 applied/failed） */
  const reloadDecisions = useCallback(async () => {
    const sid = sessionRef.current;
    if (!sid) return;
    const rows = await getSessionDecisions(db, sid);
    const next = new Map<string, Decision>();
    for (const r of rows) next.set(r.asset_id, toDecision(r));
    setDecisions(next);
  }, [db]);

  const runApply = useCallback(
    async (opts: RunApplyOpts): Promise<ApplyResult> => {
      const sid = sessionRef.current;
      if (!sid) return { appliedAlbum: 0, appliedTrash: 0, pendingCount: 0 };
      const result = await runApplyPipeline(db, sid, opts);
      await reloadDecisions();
      // 套用後凍結撤銷：已套用不可逆，未套用的歷史順序亦已失真
      historyRef.current = [];
      return result;
    },
    [db, reloadDecisions],
  );

  const value = useMemo<SessionState>(() => {
    const current = queue[index] ?? null;
    const processedCount = decisions.size;
    const trashCount = [...decisions.values()].filter((d) => d.action === 'trash').length;
    return {
      boot,
      pendingResume,
      startBoot,
      chooseResume,
      chooseFresh,
      resumeSession,
      restartFresh,
      sessionId,
      source,
      sortOrder,
      queue,
      index,
      current,
      positionLabel:
        queue.length === 0
          ? '0 / 0'
          : `${Math.min(index + 1, queue.length)} / ${queue.length}${hasMore ? '+' : ''}`,
      hasMore,
      loading,
      limitedAccess,
      targets,
      selectedTargetId,
      decisions,
      trashCount,
      processedCount,
      canUndo: historyRef.current.length > 0,
      setSource,
      setSortOrder,
      setLimitedAccess,
      selectTarget,
      refreshTargets,
      addTarget,
      classifyCurrent,
      undo,
      loadMore,
      updateDecisions,
      removeDecisions,
      backfillMissingUris,
      runApply,
    };
  }, [
    queue,
    index,
    hasMore,
    decisions,
    boot,
    pendingResume,
    startBoot,
    chooseResume,
    chooseFresh,
    resumeSession,
    restartFresh,
    sessionId,
    source,
    sortOrder,
    loading,
    limitedAccess,
    targets,
    selectedTargetId,
    setSource,
    setSortOrder,
    selectTarget,
    refreshTargets,
    addTarget,
    classifyCurrent,
    undo,
    loadMore,
    updateDecisions,
    removeDecisions,
    backfillMissingUris,
    runApply,
  ]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
