import type * as SQLite from 'expo-sqlite';
import { setPref } from './db';

export interface RecordedJsError {
  source: string;
  message: string;
  stack?: string;
  componentStack?: string;
  isFatal?: boolean;
  timestamp: number;
}

interface ErrorUtilsLike {
  getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
}

const LAST_JS_ERROR_KEY = 'last_js_error';

let installed = false;
let boundDb: SQLite.SQLiteDatabase | null = null;
let pendingError: RecordedJsError | null = null;

function formatError(source: string, error: unknown, isFatal?: boolean, componentStack?: string): RecordedJsError {
  const err = error instanceof Error ? error : null;
  return {
    source,
    message: err ? `${err.name}: ${err.message}` : String(error),
    stack: err?.stack?.slice(0, 4000),
    componentStack: componentStack?.slice(0, 2000),
    isFatal,
    timestamp: Date.now(),
  };
}

function persistRecord(record: RecordedJsError): void {
  pendingError = record;
  if (!boundDb) return;
  const db = boundDb;
  void setPref(db, LAST_JS_ERROR_KEY, JSON.stringify(record)).catch(() => {
    // Ignore SQLite write failures during crash handling.
  });
}

/** Bind SQLite instance so global/boundary errors are persisted locally for diagnostics. */
export function bindCrashGuardDb(db: SQLite.SQLiteDatabase): void {
  boundDb = db;
  if (pendingError) {
    const toFlush = pendingError;
    pendingError = null;
    persistRecord(toFlush);
  }
}

/** Record a caught error from ErrorBoundary or guarded async flows without crashing. */
export function recordCaughtError(source: string, error: unknown, componentStack?: string): RecordedJsError {
  const record = formatError(source, error, false, componentStack);
  console.error(`[${source}] ${record.message}`, record.stack ?? '');
  persistRecord(record);
  return record;
}

/**
 * Install a global JS error handler once to capture details before RN's default handler runs.
 * Preserves and delegates to the previous global handler.
 */
export function installGlobalErrorHandler(): void {
  if (installed) return;
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) return;

  installed = true;
  const previousHandler = errorUtils.getGlobalHandler?.();

  errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    const record = formatError('GlobalErrorHandler', error, isFatal);
    console.error(`[GlobalErrorHandler] fatal=${String(isFatal)} ${record.message}`, record.stack ?? '');
    persistRecord(record);
    previousHandler?.(error, isFatal);
  });
}
