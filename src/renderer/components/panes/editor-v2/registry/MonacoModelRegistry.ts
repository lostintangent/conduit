/**
 * MonacoModelRegistry - Global registry for Monaco text models.
 *
 * This singleton registry ensures that each file has exactly ONE Monaco text model,
 * shared across all editor instances. This enables:
 *
 * - **Automatic Sync**: Edits in one tab instantly appear in all other tabs showing
 *   the same file because they share the same model object.
 * - **Preserved Undo/Redo**: Undo history lives in the model, so it survives tab switches.
 * - **Version-Based Dirty Tracking**: Uses Monaco's alternativeVersionId for accurate
 *   dirty detection that works correctly with undo/redo.
 * - **External Change Detection**: Integrates with FileSystemProvider to detect when
 *   files are modified externally, enabling auto-reload or conflict warnings.
 *
 * Key Design Decisions:
 *
 * 1. **Reference Counting**: Multiple editors can share one model. The model is only
 *    disposed when all references are released AND a grace period expires.
 *
 * 2. **Grace Period**: When refCount drops to zero, we wait 5 seconds before disposal.
 *    This prevents thrashing during rapid tab switching.
 *
 * 3. **Version-Based Dirty**: Instead of comparing content strings (expensive, breaks
 *    with undo), we compare model.getAlternativeVersionId() against savedVersionId.
 *
 * 4. **LRU Eviction**: Memory is bounded by disposing least-recently-used models,
 *    but NEVER evicts dirty models (unsaved work is sacred).
 *
 * Usage:
 * ```typescript
 * const registry = MonacoModelRegistry.getInstance();
 *
 * // Get or create a model (loads content if new)
 * const model = await registry.getOrCreateModel('/path/to/file.ts', '/project');
 *
 * // Track which editor is using the model
 * registry.addReference('file:///path/to/file.ts', 'editor-1');
 *
 * // Listen for state changes
 * const sub = registry.onModelStateChanged((event) => {
 *   if (event.type === 'dirty') console.log('Dirty:', event.isDirty);
 * });
 *
 * // Save the model to disk
 * await registry.saveModel('file:///path/to/file.ts');
 *
 * // Release reference when done
 * registry.removeReference('file:///path/to/file.ts', 'editor-1');
 * ```
 *
 * @see docs/architecture/editor-v2-design-narrative.md (Section 9)
 */

import * as monaco from "monaco-editor";
import { FileSystemV2API } from "../../../../api/FileSystemV2API";
import type { ModelEntry, ModelState, ModelStateEvent } from "../types";
import { FileTooLargeError } from "../types";
import { EventEmitter } from "../utils/EventEmitter";

// ============================================================================
// Constants
// ============================================================================

/** Grace period before disposing a model with zero references (ms) */
const DISPOSE_GRACE_PERIOD_MS = 5000;

/** Default maximum number of models to keep (LRU eviction) */
const DEFAULT_MAX_MODELS = 50;

/** Default maximum file size in bytes (5 MB) */
const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;

/** Warning threshold for file size (1 MB) - files above this show a warning */
const WARNING_FILE_SIZE = 1 * 1024 * 1024;

/** Enable debug mode via environment or global flag */
const DEBUG_REFERENCE_TRACKING =
  typeof window !== "undefined" &&
  // @ts-expect-error - Debug flag set externally
  (window.__MONACO_DEBUG_REFERENCES__ === true ||
    process.env.NODE_ENV === "development");

/**
 * Reference tracking event for debugging.
 */
interface ReferenceEvent {
  type: "add" | "remove";
  uri: string;
  editorId: string;
  timestamp: number;
  refCountAfter: number;
  stackTrace?: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert a file path to a Monaco URI string.
 *
 * Monaco uses URI strings as model identifiers. We use file:// URIs
 * for consistency with VS Code conventions.
 */
function pathToUri(filePath: string): string {
  return monaco.Uri.file(filePath).toString();
}

/**
 * Convert a Monaco URI string back to a file path.
 */
function uriToPath(uri: string): string {
  return monaco.Uri.parse(uri).fsPath;
}

/**
 * Detect language from file path for Monaco.
 */
function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";

  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    md: "markdown",
    css: "css",
    scss: "scss",
    less: "less",
    html: "html",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    sql: "sql",
    graphql: "graphql",
    dockerfile: "dockerfile",
  };

  return languageMap[ext] || "plaintext";
}

// ============================================================================
// MonacoModelRegistry
// ============================================================================

/**
 * Singleton registry for Monaco text models.
 *
 * Ensures one model per file, with reference counting, dirty tracking,
 * and filesystem integration.
 */
export class MonacoModelRegistry {
  // ---------------------------------------------------------------------------
  // Singleton
  // ---------------------------------------------------------------------------

  private static instance: MonacoModelRegistry | null = null;

  /** Static event emitter for reset notifications (persists across resets) */
  private static readonly _onReset = new EventEmitter<void>();

  /**
   * Event fired when the registry is reset.
   *
   * Components should subscribe to this event and reinitialize when fired.
   * This is a static event that persists across instance resets.
   */
  static readonly onReset = MonacoModelRegistry._onReset.event;

  /**
   * Get the singleton instance.
   */
  static getInstance(): MonacoModelRegistry {
    if (!MonacoModelRegistry.instance) {
      MonacoModelRegistry.instance = new MonacoModelRegistry();
    }
    return MonacoModelRegistry.instance;
  }

  /**
   * Reset the singleton instance (for testing only).
   *
   * Fires the onReset event before disposing so components can clean up.
   * Then disposes all models and clears the singleton.
   */
  static resetInstance(): void {
    // Fire reset event BEFORE disposing so listeners can clean up
    MonacoModelRegistry._onReset.fire();

    if (MonacoModelRegistry.instance) {
      MonacoModelRegistry.instance.disposeAll();
      MonacoModelRegistry.instance = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal State
  // ---------------------------------------------------------------------------

  /** Map of URI to model entry */
  private models = new Map<string, ModelEntry>();

  /**
   * Map of model key to pending load promise (prevents concurrent loads).
   * Key format: `${cwd}:${uri}` to handle same file path in different cwds.
   */
  private loadingPromises = new Map<
    string,
    Promise<monaco.editor.ITextModel>
  >();

  /**
   * Map of model key to AbortController for canceling in-flight loads.
   * Used by disposeAll() to abort pending loads cleanly.
   */
  private loadingAbortControllers = new Map<string, AbortController>();

  /** Flag to prevent new loads after disposal has started */
  private isDisposing = false;

  /** FileSystem APIs by CWD (for file watching) */
  private fsApis = new Map<string, FileSystemV2API>();

  /** Event emitter for model state changes */
  private readonly _onModelStateChanged = new EventEmitter<ModelStateEvent>();

  /** Maximum number of models (for LRU eviction) */
  private maxModels: number = DEFAULT_MAX_MODELS;

  /** Maximum file size in bytes */
  private maxFileSize: number = DEFAULT_MAX_FILE_SIZE;

  /** Approximate total memory used by all models (bytes) */
  private totalMemoryUsage = 0;

  /** Debug: History of reference events (only in debug mode) */
  private referenceHistory: ReferenceEvent[] = [];

  /** Debug: Maximum history entries to keep */
  private readonly maxHistoryEntries = 1000;

  /** Private constructor - use getInstance() */
  private constructor() {}

  // ---------------------------------------------------------------------------
  // Public Events
  // ---------------------------------------------------------------------------

  /**
   * Event fired when model state changes (dirty, orphaned, external changes).
   */
  readonly onModelStateChanged = this._onModelStateChanged.event;

  // ---------------------------------------------------------------------------
  // Public Methods - Model Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Get an existing model or create a new one.
   *
   * If a model already exists for the file:
   * - Returns the existing model (instant)
   * - Updates lastUsed timestamp
   *
   * If no model exists:
   * - Reads file content from disk
   * - Creates Monaco model
   * - Sets up content change listening
   * - Sets up file system event subscriptions
   *
   * @param filePath - Absolute path to the file
   * @param cwd - Working directory (for FileSystemV2API)
   * @returns The Monaco text model
   */
  async getOrCreateModel(
    filePath: string,
    cwd: string,
  ): Promise<monaco.editor.ITextModel> {
    // Prevent new loads during disposal
    if (this.isDisposing) {
      throw new Error("Registry is being disposed, cannot create new models");
    }

    const uri = pathToUri(filePath);
    const existing = this.models.get(uri);

    if (existing) {
      // Cancel any pending disposal
      if (existing.disposeTimer) {
        clearTimeout(existing.disposeTimer);
        existing.disposeTimer = undefined;
      }

      return existing.model;
    }

    // Key includes cwd to prevent incorrect deduplication when same
    // relative path exists in different working directories
    const loadingKey = `${cwd}:${uri}`;

    // Check if a load is already in progress for this URI+cwd
    const pendingLoad = this.loadingPromises.get(loadingKey);
    if (pendingLoad) {
      // Return the existing promise - don't start a second load
      return pendingLoad;
    }

    // Create AbortController for this load
    const abortController = new AbortController();
    this.loadingAbortControllers.set(loadingKey, abortController);

    // Start loading and track the promise
    const loadPromise = this.createModel(filePath, cwd, abortController.signal)
      .then((model) => {
        // Run LRU eviction after successful load
        this.evictLRU();
        return model;
      })
      .finally(() => {
        // Remove from loading map whether success or failure
        this.loadingPromises.delete(loadingKey);
        this.loadingAbortControllers.delete(loadingKey);
      });

    // Track the loading promise before awaiting
    this.loadingPromises.set(loadingKey, loadPromise);

    return loadPromise;
  }

  /**
   * Add a reference to a model from an editor.
   *
   * Call this when an editor starts using a model.
   * Cancels any pending disposal timer.
   *
   * @param uri - The model URI (use pathToUri to convert)
   * @param editorId - The editor using this model
   */
  addReference(uri: string, editorId: string): void {
    const entry = this.models.get(uri);
    if (!entry) {
      console.warn(
        `[MonacoModelRegistry] addReference: Model not found for URI ${uri}`,
      );
      return;
    }

    // Cancel any pending disposal
    if (entry.disposeTimer) {
      clearTimeout(entry.disposeTimer);
      entry.disposeTimer = undefined;
    }

    entry.references.add(editorId);

    // Debug tracking
    if (DEBUG_REFERENCE_TRACKING) {
      this.trackReferenceEvent("add", uri, editorId, entry.references.size);
    }
  }

  /**
   * Remove a reference to a model from an editor.
   *
   * Call this when an editor stops using a model.
   * If refCount drops to zero, starts the grace period timer.
   *
   * @param uri - The model URI
   * @param editorId - The editor releasing this model
   */
  removeReference(uri: string, editorId: string): void {
    const entry = this.models.get(uri);
    if (!entry) {
      // Debug: Track orphan removeReference calls
      if (DEBUG_REFERENCE_TRACKING) {
        console.warn(
          `[MonacoModelRegistry] removeReference: Model not found for URI ${uri} (editorId: ${editorId})`,
        );
      }
      return;
    }

    entry.references.delete(editorId);

    // Debug tracking
    if (DEBUG_REFERENCE_TRACKING) {
      this.trackReferenceEvent("remove", uri, editorId, entry.references.size);
    }

    // Start grace period if no more references
    if (entry.references.size === 0 && !entry.disposeTimer) {
      entry.disposeTimer = setTimeout(() => {
        this.disposeModelIfUnreferenced(uri);
      }, DISPOSE_GRACE_PERIOD_MS);
    }
  }

  /**
   * Get the current state of a model.
   *
   * @param uri - The model URI
   * @returns Model state, or undefined if model doesn't exist
   */
  getModelState(uri: string): ModelState | undefined {
    const entry = this.models.get(uri);
    if (!entry) {
      return undefined;
    }

    return {
      isDirty: entry.isDirty,
      isOrphaned: entry.isOrphaned,
      hasExternalChanges: entry.hasExternalChanges,
    };
  }

  /**
   * Get a model by URI without creating it.
   *
   * @param uri - The model URI
   * @returns The model, or undefined if not found
   */
  getModel(uri: string): monaco.editor.ITextModel | undefined {
    return this.models.get(uri)?.model;
  }

  /**
   * Check if a model exists.
   *
   * @param uri - The model URI
   */
  hasModel(uri: string): boolean {
    return this.models.has(uri);
  }

  /**
   * Get the number of references to a model.
   *
   * @param uri - The model URI
   * @returns Reference count, or 0 if model doesn't exist
   */
  getReferenceCount(uri: string): number {
    return this.models.get(uri)?.references.size ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Public Methods - File Operations
  // ---------------------------------------------------------------------------

  /**
   * Save a model's content to disk.
   *
   * Updates savedVersionId and clears dirty flag on success.
   *
   * @param uri - The model URI
   * @throws If the model doesn't exist or save fails
   */
  async saveModel(uri: string): Promise<void> {
    const entry = this.models.get(uri);
    if (!entry) {
      throw new Error(`Model not found: ${uri}`);
    }

    const filePath = uriToPath(uri);
    const content = entry.model.getValue();
    const fsApi = this.getOrCreateFsApi(entry.cwd);

    await fsApi.writeTextFile(filePath, content);

    // Update saved version
    entry.savedVersionId = entry.model.getAlternativeVersionId();
    entry.isDirty = false;
    entry.hasExternalChanges = false;
    entry.isOrphaned = false; // File now exists (we just wrote it)

    this._onModelStateChanged.fire({
      type: "saved",
      uri,
    });

    // Also fire dirty event since isDirty changed
    this._onModelStateChanged.fire({
      type: "dirty",
      uri,
      isDirty: false,
    });
  }

  /**
   * Reload a model's content from disk.
   *
   * Discards any unsaved changes and resets dirty state.
   *
   * @param uri - The model URI
   * @throws If the model doesn't exist or read fails
   */
  async reloadModel(uri: string): Promise<void> {
    const entry = this.models.get(uri);
    if (!entry) {
      throw new Error(`Model not found: ${uri}`);
    }

    const filePath = uriToPath(uri);
    const fsApi = this.getOrCreateFsApi(entry.cwd);

    const content = await fsApi.readTextFile(filePath);

    // Update model content (this will trigger onDidChangeContent)
    entry.model.setValue(content);

    // Reset state
    entry.savedVersionId = entry.model.getAlternativeVersionId();
    entry.isDirty = false;
    entry.hasExternalChanges = false;
    entry.isOrphaned = false;

    this._onModelStateChanged.fire({
      type: "reloaded",
      uri,
    });
  }

  /**
   * Clear the external changes flag without reloading.
   *
   * Use this when the user chooses "Keep My Changes" in the conflict UI.
   *
   * @param uri - The model URI
   */
  clearExternalChanges(uri: string): void {
    const entry = this.models.get(uri);
    if (entry && entry.hasExternalChanges) {
      entry.hasExternalChanges = false;
      // Note: File is still different on disk, but user acknowledged it
    }
  }

  // ---------------------------------------------------------------------------
  // Public Methods - Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Get the number of models in the registry.
   */
  get modelCount(): number {
    return this.models.size;
  }

  /**
   * Set the maximum number of models (for LRU eviction).
   *
   * @param max - Maximum models to keep
   */
  setMaxModels(max: number): void {
    this.maxModels = max;
    this.evictLRU();
  }

  /**
   * Get the current maximum file size limit.
   */
  getMaxFileSize(): number {
    return this.maxFileSize;
  }

  /**
   * Set the maximum file size limit.
   *
   * @param size - Maximum file size in bytes
   */
  setMaxFileSize(size: number): void {
    this.maxFileSize = size;
  }

  /**
   * Get approximate total memory used by all models.
   *
   * This is a rough estimate based on content length in characters.
   * Actual memory usage may vary due to string encoding and Monaco overhead.
   */
  getTotalMemoryUsage(): number {
    return this.totalMemoryUsage;
  }

  /**
   * Dispose a specific model.
   *
   * @param uri - The model URI
   */
  disposeModel(uri: string): void {
    const entry = this.models.get(uri);
    if (!entry) {
      return;
    }

    // Update memory tracking (use 2x for UTF-16 internal representation)
    const contentLength = entry.model.getValue().length * 2;
    this.totalMemoryUsage = Math.max(0, this.totalMemoryUsage - contentLength);

    // Clear disposal timer
    if (entry.disposeTimer) {
      clearTimeout(entry.disposeTimer);
    }

    // Dispose content change listener
    entry.contentChangeDisposable.dispose();

    // Dispose file watch subscriptions
    for (const disposable of entry.fileWatchDisposables) {
      disposable.dispose();
    }

    // Dispose the Monaco model
    entry.model.dispose();

    // Remove from registry
    this.models.delete(uri);
  }

  /**
   * Dispose all models and clean up.
   *
   * Used during shutdown or testing cleanup.
   * Aborts all in-flight loads to prevent models being created after disposal.
   */
  disposeAll(): void {
    // Set disposing flag to prevent new loads
    this.isDisposing = true;

    // Abort all in-flight loads
    for (const [key, controller] of this.loadingAbortControllers) {
      try {
        controller.abort();
      } catch (error) {
        console.error(
          `[MonacoModelRegistry] Error aborting load for ${key}:`,
          error,
        );
      }
    }
    this.loadingAbortControllers.clear();
    this.loadingPromises.clear();

    // Dispose all models
    for (const uri of this.models.keys()) {
      this.disposeModel(uri);
    }

    // Release all filesystem APIs
    for (const fsApi of this.fsApis.values()) {
      fsApi.release();
    }
    this.fsApis.clear();

    // Dispose event emitter
    this._onModelStateChanged.dispose();

    // Reset disposing flag (in case instance is reused)
    this.isDisposing = false;
  }

  // ---------------------------------------------------------------------------
  // Debug Methods (Development Only)
  // ---------------------------------------------------------------------------

  /**
   * Track a reference event for debugging.
   */
  private trackReferenceEvent(
    type: "add" | "remove",
    uri: string,
    editorId: string,
    refCountAfter: number,
  ): void {
    const event: ReferenceEvent = {
      type,
      uri,
      editorId,
      timestamp: Date.now(),
      refCountAfter,
      stackTrace: new Error().stack,
    };

    this.referenceHistory.push(event);

    // Trim history if too long
    if (this.referenceHistory.length > this.maxHistoryEntries) {
      this.referenceHistory = this.referenceHistory.slice(
        -this.maxHistoryEntries,
      );
    }

    // Log to console in debug mode
    console.debug(
      `[MonacoModelRegistry] ${type}Reference: ${uri} (editor: ${editorId}) -> refCount: ${refCountAfter}`,
    );
  }

  /**
   * Get reference history for debugging (development only).
   *
   * @param uri - Optional filter by URI
   * @returns Array of reference events
   */
  getDebugReferenceHistory(uri?: string): ReferenceEvent[] {
    if (uri) {
      return this.referenceHistory.filter((e) => e.uri === uri);
    }
    return [...this.referenceHistory];
  }

  /**
   * Check for potential reference leaks (development only).
   *
   * Returns models that have references but no recent "add" events,
   * which could indicate orphaned references.
   *
   * @param maxAgeMs - Max age for "recent" events (default: 5 minutes)
   * @returns Array of potentially leaked URIs with their reference counts
   */
  detectPotentialLeaks(maxAgeMs: number = 5 * 60 * 1000): Array<{
    uri: string;
    refCount: number;
    lastEventAge: number;
  }> {
    const now = Date.now();
    const potentialLeaks: Array<{
      uri: string;
      refCount: number;
      lastEventAge: number;
    }> = [];

    for (const [uri, entry] of this.models) {
      if (entry.references.size > 0) {
        // Find the most recent event for this URI
        const recentEvents = this.referenceHistory.filter(
          (e) => e.uri === uri && now - e.timestamp < maxAgeMs,
        );

        if (recentEvents.length === 0) {
          // No recent events for this model with references - potential leak
          const lastEvent = this.referenceHistory
            .filter((e) => e.uri === uri)
            .pop();

          potentialLeaks.push({
            uri,
            refCount: entry.references.size,
            lastEventAge: lastEvent ? now - lastEvent.timestamp : Infinity,
          });
        }
      }
    }

    return potentialLeaks;
  }

  /**
   * Clear reference history (for testing).
   */
  clearDebugHistory(): void {
    this.referenceHistory = [];
  }

  // ---------------------------------------------------------------------------
  // Internal Methods
  // ---------------------------------------------------------------------------

  /**
   * Create a new model and add it to the registry.
   *
   * @param signal - AbortSignal to cancel the load operation
   * @throws {FileTooLargeError} If the file exceeds the maximum size limit
   * @throws {Error} If the load was aborted
   */
  private async createModel(
    filePath: string,
    cwd: string,
    signal: AbortSignal,
  ): Promise<monaco.editor.ITextModel> {
    const uri = pathToUri(filePath);
    const fsApi = this.getOrCreateFsApi(cwd);

    // Check if already aborted
    if (signal.aborted) {
      throw new Error("Model load was aborted");
    }

    // Check file size before reading content
    // Wrapped in try/catch to handle file system errors gracefully
    let fileSize: number;
    try {
      const stats = await fsApi.stat(filePath);
      fileSize = stats.size;
    } catch (statError) {
      // Handle specific file system errors
      const errorMessage =
        statError instanceof Error ? statError.message : String(statError);

      // ENOENT - file not found (may have been deleted)
      if (
        errorMessage.includes("ENOENT") ||
        errorMessage.includes("no such file")
      ) {
        throw new Error(`File not found: ${filePath}`);
      }

      // EACCES - permission denied
      if (
        errorMessage.includes("EACCES") ||
        errorMessage.includes("permission denied")
      ) {
        throw new Error(`Permission denied: ${filePath}`);
      }

      // Re-throw with context for other errors
      throw new Error(`Failed to stat file "${filePath}": ${errorMessage}`);
    }

    // Check abort after async operation
    if (signal.aborted) {
      throw new Error("Model load was aborted");
    }

    // Reject files that exceed the maximum size limit
    if (fileSize > this.maxFileSize) {
      throw new FileTooLargeError(filePath, fileSize, this.maxFileSize);
    }

    // Warn about large files (above warning threshold but below max)
    if (fileSize > WARNING_FILE_SIZE) {
      this._onModelStateChanged.fire({
        type: "fileSizeWarning",
        uri,
        fileSize,
      });
    }

    // Read file content
    const content = await fsApi.readTextFile(filePath);

    // Check abort after async operation
    if (signal.aborted) {
      throw new Error("Model load was aborted");
    }

    // Re-check content size after read (file may have grown since stat)
    // Use byte count estimate (content.length * 2 for UTF-16)
    const actualContentBytes = content.length * 2;
    if (actualContentBytes > this.maxFileSize) {
      throw new FileTooLargeError(
        filePath,
        actualContentBytes,
        this.maxFileSize,
      );
    }

    // Update memory tracking (use 2x for UTF-16 internal representation)
    this.totalMemoryUsage += actualContentBytes;

    // Detect language
    const language = detectLanguage(filePath);

    // Create Monaco model
    const model = monaco.editor.createModel(
      content,
      language,
      monaco.Uri.parse(uri),
    );

    // Create entry
    const entry: ModelEntry = {
      model,
      references: new Set(),
      cwd,
      filePath,
      savedVersionId: model.getAlternativeVersionId(),
      isDirty: false,
      isOrphaned: false,
      hasExternalChanges: false,
      isReloading: false,
      contentChangeDisposable: { dispose: () => {} },
      fileWatchDisposables: [],
    };

    // Set up content change listener for dirty tracking
    entry.contentChangeDisposable = model.onDidChangeContent(() => {
      this.handleContentChange(uri, entry);
    });

    // Set up file system event subscriptions
    this.setupFileWatching(uri, filePath, entry, fsApi);

    // Add to registry
    this.models.set(uri, entry);

    return model;
  }

  /**
   * Handle model content changes (user edits).
   *
   * Updates dirty state based on version comparison.
   */
  private handleContentChange(uri: string, entry: ModelEntry): void {
    const currentVersion = entry.model.getAlternativeVersionId();
    const wasDirty = entry.isDirty;
    const isDirty = currentVersion !== entry.savedVersionId;

    if (wasDirty !== isDirty) {
      entry.isDirty = isDirty;
      this._onModelStateChanged.fire({
        type: "dirty",
        uri,
        isDirty,
      });
    }
  }

  /**
   * Set up file system event subscriptions for a model.
   *
   * IMPORTANT: All callbacks derive the current URI from entry.filePath
   * instead of capturing the initial URI in a closure. This ensures
   * callbacks continue to work correctly after file renames.
   *
   * After a rename:
   * 1. handleFileRenamed updates entry.filePath to the new path
   * 2. Registry mapping is updated with the new URI
   * 3. Subsequent events use entry.filePath to derive the current URI
   */
  private setupFileWatching(
    _uri: string,
    _filePath: string,
    entry: ModelEntry,
    fsApi: FileSystemV2API,
  ): void {
    // Listen for file content changes
    // Derives URI from entry.filePath at call time to handle renames
    const contentCleanup = fsApi.onAnyFileContentChanged((changedPath) => {
      if (changedPath === entry.filePath) {
        const currentUri = pathToUri(entry.filePath);
        this.handleExternalFileChange(currentUri, entry);
      }
    });
    entry.fileWatchDisposables.push({ dispose: contentCleanup });

    // Listen for file deletion
    const deleteCleanup = fsApi.onAnyFileDeleted((deletedPath) => {
      if (deletedPath === entry.filePath) {
        const currentUri = pathToUri(entry.filePath);
        this.handleFileDeleted(currentUri, entry);
      }
    });
    entry.fileWatchDisposables.push({ dispose: deleteCleanup });

    // Listen for file rename
    // Derives URI at call time so multiple renames work correctly
    const renameCleanup = fsApi.onAnyFileRenamed((oldPath, newPath) => {
      if (oldPath === entry.filePath) {
        const currentUri = pathToUri(entry.filePath);
        this.handleFileRenamed(currentUri, oldPath, newPath, entry);
      }
    });
    entry.fileWatchDisposables.push({ dispose: renameCleanup });
  }

  /**
   * Handle external file content change.
   *
   * - If model is NOT dirty: auto-reload
   * - If model IS dirty: mark as having external changes (conflict)
   *
   * Race condition protections:
   * 1. `isReloading` prevents concurrent reload attempts
   * 2. Re-check `isDirty` after async file read to catch edits during load
   */
  private async handleExternalFileChange(
    uri: string,
    entry: ModelEntry,
  ): Promise<void> {
    // Skip if already reloading (prevents concurrent reload attempts)
    if (entry.isReloading) {
      return;
    }

    if (entry.isDirty) {
      // Conflict: user has unsaved changes AND file changed externally
      entry.hasExternalChanges = true;
      this._onModelStateChanged.fire({
        type: "externalChange",
        uri,
        hasConflict: true,
      });
    } else {
      // No conflict at start: attempt auto-reload
      entry.isReloading = true;
      try {
        // Use entry.filePath directly for consistency (avoids uri conversion)
        const fsApi = this.getOrCreateFsApi(entry.cwd);
        const content = await fsApi.readTextFile(entry.filePath);

        // Re-check isDirty after async read - user may have typed while loading
        if (entry.isDirty) {
          // User started editing during reload - treat as conflict
          entry.hasExternalChanges = true;
          this._onModelStateChanged.fire({
            type: "externalChange",
            uri,
            hasConflict: true,
          });
          return;
        }

        // Still clean - safe to auto-reload
        entry.model.setValue(content);

        // Update saved version (file on disk is now this content)
        entry.savedVersionId = entry.model.getAlternativeVersionId();

        this._onModelStateChanged.fire({
          type: "externalChange",
          uri,
          hasConflict: false,
        });
      } catch (error) {
        console.error(
          `[MonacoModelRegistry] Failed to auto-reload ${uri}:`,
          error,
        );
      } finally {
        entry.isReloading = false;
      }
    }
  }

  /**
   * Handle file deletion.
   */
  private handleFileDeleted(uri: string, entry: ModelEntry): void {
    entry.isOrphaned = true;
    this._onModelStateChanged.fire({
      type: "orphaned",
      uri,
      isOrphaned: true,
    });
  }

  /**
   * Handle file rename.
   *
   * Updates the model's URI to match the new path.
   */
  private handleFileRenamed(
    oldUri: string,
    _oldPath: string,
    newPath: string,
    entry: ModelEntry,
  ): void {
    const newUri = pathToUri(newPath);

    // Monaco models are immutable in their URI, so we need to:
    // 1. Create a new model with the new URI
    // 2. Copy content and state
    // 3. Dispose the old model
    // 4. Update registry mapping

    const content = entry.model.getValue();
    const language = detectLanguage(newPath);

    // Create new model
    const newModel = monaco.editor.createModel(
      content,
      language,
      monaco.Uri.parse(newUri),
    );

    // Update entry
    const oldModel = entry.model;
    entry.model = newModel;

    // Set up new content change listener
    entry.contentChangeDisposable.dispose();
    entry.contentChangeDisposable = newModel.onDidChangeContent(() => {
      this.handleContentChange(newUri, entry);
    });

    // Update registry mapping
    this.models.delete(oldUri);
    this.models.set(newUri, entry);

    // Dispose old model
    oldModel.dispose();

    // File is no longer orphaned (it was renamed, not deleted)
    entry.isOrphaned = false;

    // Update filePath so file watchers continue to work correctly
    // (callbacks reference entry.filePath instead of a captured variable)
    entry.filePath = newPath;
  }

  /**
   * Dispose a model if it has no references (called after grace period).
   */
  private disposeModelIfUnreferenced(uri: string): void {
    const entry = this.models.get(uri);
    if (!entry) {
      return;
    }

    // Don't dispose if references were added during grace period
    if (entry.references.size > 0) {
      return;
    }

    // Don't dispose dirty models (user's unsaved work)
    if (entry.isDirty) {
      return;
    }

    this.disposeModel(uri);
  }

  /**
   * Get or create a FileSystemV2API for a CWD.
   */
  private getOrCreateFsApi(cwd: string): FileSystemV2API {
    let fsApi = this.fsApis.get(cwd);
    if (!fsApi) {
      fsApi = new FileSystemV2API(cwd);
      this.fsApis.set(cwd, fsApi);
    }
    return fsApi;
  }

  /**
   * Evict least-recently-used models to stay within maxModels limit.
   *
   * NEVER evicts dirty models - user's unsaved work is protected.
   */
  private evictLRU(): void {
    if (this.models.size <= this.maxModels) {
      return;
    }

    // Get non-dirty models sorted by reference count, then we could add lastUsed tracking
    // For simplicity, evict models with zero references first
    const candidates = Array.from(this.models.entries())
      .filter(([, entry]) => !entry.isDirty && entry.references.size === 0)
      .map(([uri]) => uri);

    // Dispose candidates until we're at the limit
    for (const uri of candidates) {
      if (this.models.size <= this.maxModels) {
        break;
      }
      this.disposeModel(uri);
    }
  }
}

// ============================================================================
// Utility Exports
// ============================================================================

export { pathToUri, uriToPath };
