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
import type {
  Disposable,
  ModelEntry,
  ModelState,
  ModelStateEvent,
} from "../types";
import { EventEmitter } from "../utils/EventEmitter";

// ============================================================================
// Constants
// ============================================================================

/** Grace period before disposing a model with zero references (ms) */
const DISPOSE_GRACE_PERIOD_MS = 5000;

/** Default maximum number of models to keep (LRU eviction) */
const DEFAULT_MAX_MODELS = 50;

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
   * Disposes all models and clears the singleton.
   */
  static resetInstance(): void {
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

  /** FileSystem APIs by CWD (for file watching) */
  private fsApis = new Map<string, FileSystemV2API>();

  /** Event emitter for model state changes */
  private readonly _onModelStateChanged = new EventEmitter<ModelStateEvent>();

  /** Maximum number of models (for LRU eviction) */
  private maxModels: number = DEFAULT_MAX_MODELS;

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

    // Create new model
    const model = await this.createModel(filePath, cwd);

    // Run LRU eviction if needed
    this.evictLRU();

    return model;
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
      return;
    }

    entry.references.delete(editorId);

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
   * Dispose a specific model.
   *
   * @param uri - The model URI
   */
  disposeModel(uri: string): void {
    const entry = this.models.get(uri);
    if (!entry) {
      return;
    }

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
   */
  disposeAll(): void {
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
  }

  // ---------------------------------------------------------------------------
  // Internal Methods
  // ---------------------------------------------------------------------------

  /**
   * Create a new model and add it to the registry.
   */
  private async createModel(
    filePath: string,
    cwd: string,
  ): Promise<monaco.editor.ITextModel> {
    const uri = pathToUri(filePath);
    const fsApi = this.getOrCreateFsApi(cwd);

    // Read file content
    const content = await fsApi.readTextFile(filePath);

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
      savedVersionId: model.getAlternativeVersionId(),
      isDirty: false,
      isOrphaned: false,
      hasExternalChanges: false,
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
   */
  private setupFileWatching(
    uri: string,
    filePath: string,
    entry: ModelEntry,
    fsApi: FileSystemV2API,
  ): void {
    // Listen for file content changes
    const contentCleanup = fsApi.onAnyFileContentChanged((changedPath) => {
      if (changedPath === filePath) {
        this.handleExternalFileChange(uri, entry);
      }
    });
    entry.fileWatchDisposables.push({ dispose: contentCleanup });

    // Listen for file deletion
    const deleteCleanup = fsApi.onAnyFileDeleted((deletedPath) => {
      if (deletedPath === filePath) {
        this.handleFileDeleted(uri, entry);
      }
    });
    entry.fileWatchDisposables.push({ dispose: deleteCleanup });

    // Listen for file rename
    const renameCleanup = fsApi.onAnyFileRenamed((oldPath, newPath) => {
      if (oldPath === filePath) {
        this.handleFileRenamed(uri, oldPath, newPath, entry);
      }
    });
    entry.fileWatchDisposables.push({ dispose: renameCleanup });
  }

  /**
   * Handle external file content change.
   *
   * - If model is NOT dirty: auto-reload
   * - If model IS dirty: mark as having external changes (conflict)
   */
  private async handleExternalFileChange(
    uri: string,
    entry: ModelEntry,
  ): Promise<void> {
    if (entry.isDirty) {
      // Conflict: user has unsaved changes AND file changed externally
      entry.hasExternalChanges = true;
      this._onModelStateChanged.fire({
        type: "externalChange",
        uri,
        hasConflict: true,
      });
    } else {
      // No conflict: auto-reload
      try {
        const filePath = uriToPath(uri);
        const fsApi = this.getOrCreateFsApi(entry.cwd);
        const content = await fsApi.readTextFile(filePath);

        // Update model content
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

    // Note: File watchers will need to be updated by the caller
    // since the path changed. This is a simplification - in production
    // you might want to re-setup watchers here.
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
