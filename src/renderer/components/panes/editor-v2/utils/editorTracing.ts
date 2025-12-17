/**
 * EditorTracing - Performance tracing utility for Editor V2.
 *
 * Provides detailed timing information for file loading operations
 * to help identify bottlenecks in the file selection → content display pipeline.
 *
 * Usage:
 * - Enable tracing: window.__EDITOR_TRACING__ = true
 * - View traces: window.__EDITOR_TRACES__
 * - Clear traces: EditorTracing.clear()
 *
 * Trace output format:
 * [EditorV2] <operation> | <duration>ms | <details>
 */

/** Trace entry for a single operation */
export interface TraceEntry {
  /** Operation name (e.g., "file-select", "model-load") */
  operation: string;

  /** Start timestamp (performance.now()) */
  startTime: number;

  /** End timestamp (performance.now()) */
  endTime?: number;

  /** Duration in milliseconds */
  duration?: number;

  /** File path being operated on */
  filePath?: string;

  /** Editor path: "regular" or "diff" */
  editorPath?: "regular" | "diff";

  /** Additional metadata */
  metadata?: Record<string, unknown>;

  /** Child trace IDs for nested operations */
  children?: string[];

  /** Parent trace ID */
  parentId?: string;
}

/** Active trace session for a file operation */
interface TraceSession {
  /** Session ID (typically the file path) */
  id: string;

  /** Session start time */
  startTime: number;

  /** All trace entries in this session */
  entries: Map<string, TraceEntry>;

  /** Editor path being traced */
  editorPath: "regular" | "diff";
}

/** Check if tracing is enabled */
function isEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    // @ts-expect-error - Debug flag set externally
    window.__EDITOR_TRACING__ === true
  );
}

/** Get the traces storage */
function getTraceStorage(): TraceEntry[] {
  if (typeof window === "undefined") return [];

  // @ts-expect-error - Debug storage
  if (!window.__EDITOR_TRACES__) {
    // @ts-expect-error - Debug storage
    window.__EDITOR_TRACES__ = [];
  }
  // @ts-expect-error - Debug storage
  return window.__EDITOR_TRACES__;
}

/** Active sessions by file path */
const activeSessions = new Map<string, TraceSession>();

/** Generate a unique trace ID */
function generateTraceId(operation: string): string {
  return `${operation}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Start a new trace session for a file operation.
 *
 * A session groups all traces for a single file selection event.
 *
 * @param filePath - The file being opened
 * @param editorPath - Which editor path ("regular" or "diff")
 * @returns Session ID for correlation
 */
export function startSession(
  filePath: string,
  editorPath: "regular" | "diff",
): string {
  if (!isEnabled()) return filePath;

  const session: TraceSession = {
    id: filePath,
    startTime: performance.now(),
    entries: new Map(),
    editorPath,
  };

  activeSessions.set(filePath, session);

  console.log(
    `%c[EditorV2] ▶ SESSION START | ${editorPath} | ${filePath}`,
    "color: #4CAF50; font-weight: bold",
  );

  return filePath;
}

/**
 * End a trace session and log summary.
 *
 * @param filePath - The file path (session ID)
 */
export function endSession(filePath: string): void {
  if (!isEnabled()) return;

  const session = activeSessions.get(filePath);
  if (!session) return;

  const totalDuration = performance.now() - session.startTime;

  // Log summary
  console.log(
    `%c[EditorV2] ◼ SESSION END | ${session.editorPath} | ${totalDuration.toFixed(1)}ms | ${filePath}`,
    "color: #4CAF50; font-weight: bold",
  );

  // Log breakdown
  const entries = Array.from(session.entries.values()).sort(
    (a, b) => a.startTime - b.startTime,
  );

  console.group("Session breakdown:");
  for (const entry of entries) {
    if (entry.duration !== undefined) {
      const percent = ((entry.duration / totalDuration) * 100).toFixed(1);
      console.log(
        `  ${entry.operation}: ${entry.duration.toFixed(1)}ms (${percent}%)`,
        entry.metadata ? entry.metadata : "",
      );
    }
  }
  console.groupEnd();

  // Store in global traces
  const storage = getTraceStorage();
  storage.push({
    operation: "session",
    startTime: session.startTime,
    endTime: performance.now(),
    duration: totalDuration,
    filePath,
    editorPath: session.editorPath,
    metadata: {
      entries: entries.map((e) => ({
        operation: e.operation,
        duration: e.duration,
        metadata: e.metadata,
      })),
    },
  });

  // Keep only last 50 sessions
  while (storage.length > 50) {
    storage.shift();
  }

  activeSessions.delete(filePath);
}

/**
 * Start timing an operation within a session.
 *
 * @param filePath - Session ID (file path)
 * @param operation - Operation name
 * @param metadata - Additional metadata
 * @returns Trace ID for ending the trace
 */
export function startTrace(
  filePath: string,
  operation: string,
  metadata?: Record<string, unknown>,
): string {
  if (!isEnabled()) return "";

  const traceId = generateTraceId(operation);
  const session = activeSessions.get(filePath);

  const entry: TraceEntry = {
    operation,
    startTime: performance.now(),
    filePath,
    editorPath: session?.editorPath,
    metadata,
  };

  if (session) {
    session.entries.set(traceId, entry);
  }

  console.log(
    `%c[EditorV2] → ${operation}`,
    "color: #2196F3",
    metadata ? metadata : "",
  );

  return traceId;
}

/**
 * End timing an operation.
 *
 * @param filePath - Session ID (file path)
 * @param traceId - Trace ID from startTrace
 * @param metadata - Additional metadata to merge
 */
export function endTrace(
  filePath: string,
  traceId: string,
  metadata?: Record<string, unknown>,
): void {
  if (!isEnabled() || !traceId) return;

  const session = activeSessions.get(filePath);
  if (!session) return;

  const entry = session.entries.get(traceId);
  if (!entry) return;

  entry.endTime = performance.now();
  entry.duration = entry.endTime - entry.startTime;

  if (metadata) {
    entry.metadata = { ...entry.metadata, ...metadata };
  }

  const color = entry.duration > 100 ? "#FF9800" : "#4CAF50";
  console.log(
    `%c[EditorV2] ← ${entry.operation} | ${entry.duration.toFixed(1)}ms`,
    `color: ${color}`,
    entry.metadata ? entry.metadata : "",
  );
}

/**
 * Log a single timing event (start + end in one call).
 *
 * Useful for synchronous operations or when you have the duration already.
 *
 * @param operation - Operation name
 * @param duration - Duration in milliseconds
 * @param metadata - Additional metadata
 */
export function logTiming(
  operation: string,
  duration: number,
  metadata?: Record<string, unknown>,
): void {
  if (!isEnabled()) return;

  const color = duration > 100 ? "#FF9800" : "#4CAF50";
  console.log(
    `%c[EditorV2] ● ${operation} | ${duration.toFixed(1)}ms`,
    `color: ${color}`,
    metadata ? metadata : "",
  );

  // Store in global traces
  const storage = getTraceStorage();
  storage.push({
    operation,
    startTime: performance.now() - duration,
    endTime: performance.now(),
    duration,
    metadata,
  });
}

/**
 * Create a trace wrapper for async functions.
 *
 * @param filePath - Session ID
 * @param operation - Operation name
 * @param fn - Async function to trace
 * @param metadata - Additional metadata
 * @returns Result of the async function
 */
export async function traceAsync<T>(
  filePath: string,
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>,
): Promise<T> {
  if (!isEnabled()) {
    return fn();
  }

  const traceId = startTrace(filePath, operation, metadata);
  try {
    const result = await fn();
    endTrace(filePath, traceId);
    return result;
  } catch (error) {
    endTrace(filePath, traceId, { error: String(error) });
    throw error;
  }
}

/**
 * Clear all stored traces.
 */
export function clear(): void {
  if (typeof window !== "undefined") {
    // @ts-expect-error - Debug storage
    window.__EDITOR_TRACES__ = [];
  }
  activeSessions.clear();
  console.log("[EditorV2] Traces cleared");
}

/**
 * Get all stored traces.
 */
export function getTraces(): TraceEntry[] {
  return getTraceStorage();
}

/**
 * Enable tracing.
 */
export function enable(): void {
  if (typeof window !== "undefined") {
    // @ts-expect-error - Debug flag
    window.__EDITOR_TRACING__ = true;
    console.log(
      "[EditorV2] Tracing enabled. Traces stored in window.__EDITOR_TRACES__",
    );
  }
}

/**
 * Disable tracing.
 */
export function disable(): void {
  if (typeof window !== "undefined") {
    // @ts-expect-error - Debug flag
    window.__EDITOR_TRACING__ = false;
    console.log("[EditorV2] Tracing disabled");
  }
}

// Export as namespace for convenient access
export const EditorTracing = {
  startSession,
  endSession,
  startTrace,
  endTrace,
  logTiming,
  traceAsync,
  clear,
  getTraces,
  enable,
  disable,
};

// Expose EditorTracing on window for easy console access
if (typeof window !== "undefined") {
  // @ts-expect-error - Debug utility
  window.EditorTracing = EditorTracing;
}
