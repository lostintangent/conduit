/**
 * A cwd's file system subscription, for the renderer. Each instance subscribes
 * as it's created, which keeps the cwd's watcher running and its events
 * flowing until it's suspended or released.
 *
 * Instances for the same cwd are shared through `FileSystemSubscriptionPool`.
 * Reads and writes don't need one, and go to `window.conduit.files`.
 */

import type { Events } from "@shared/rpc";
import type { Cleanup, DirectoryEntry } from "../model";
import { normalizePathForKey } from "@/utils/pathUtils";

// ============================================================================
// Types
// ============================================================================

/**
 * Callback for directory listing change events.
 */
export type DirectoryListingChangedCallback = (
  entries: DirectoryEntry[],
) => void;

/**
 * Callback for file content change events.
 */
export type FileContentChangedCallback = (path: string) => void;

/**
 * Callback for file delete events.
 */
export type FileDeletedCallback = (path: string) => void;

/**
 * Callback for file rename events.
 */
export type FileRenamedCallback = (oldPath: string, newPath: string) => void;

// Re-export Cleanup from shared types for convenience
export type { Cleanup };

/** Adds a listener under a key, and drops the key when its last listener leaves. */
function addKeyedListener<T>(
  listenersByKey: Map<string, Set<T>>,
  key: string,
  listener: T,
): Cleanup {
  const listeners = listenersByKey.get(key) ?? new Set<T>();
  listenersByKey.set(key, listeners);
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      listenersByKey.delete(key);
    }
  };
}

/** Calls each listener, so one that throws can't keep the rest from hearing. */
function notify<Args extends unknown[]>(
  listeners: Iterable<(...args: Args) => void> | undefined,
  ...args: Args
): void {
  for (const listener of listeners ?? []) {
    try {
      listener(...args);
    } catch (error) {
      console.error("[FileSystemSubscription] Error in listener:", error);
    }
  }
}

/** One instance's listeners, which hear its subscription's events. */
class Listeners {
  /** Directory listing listeners, by normalized path */
  readonly directory = new Map<string, Set<DirectoryListingChangedCallback>>();
  readonly content = new Set<FileContentChangedCallback>();
  readonly deleted = new Set<FileDeletedCallback>();
  readonly renamed = new Set<FileRenamedCallback>();

  clear(): void {
    this.directory.clear();
    this.content.clear();
    this.deleted.clear();
    this.renamed.clear();
  }
}

/** Each live subscription's listeners, by id */
const routes = new Map<string, Listeners>();

let routing = false;

/**
 * Listen once per event for every instance, and route each event to its
 * subscription's listeners, so the number of folders open doesn't add IPC
 * listeners.
 */
function routeEvents(): void {
  if (routing) {
    return;
  }
  routing = true;

  const route = <Event extends keyof Events["files"] & string>(
    event: Event,
    deliver: (listeners: Listeners, payload: Events["files"][Event]) => void,
  ) =>
    window.conduit.files.on(event, (payload) => {
      const listeners = routes.get(payload.subscriptionId);
      if (listeners) {
        deliver(listeners, payload);
      }
    });

  route("directoryListingChanged", (listeners, { path, entries }) =>
    notify(listeners.directory.get(normalizePathForKey(path)), entries),
  );
  route("fileContentChanged", (listeners, { path }) =>
    notify(listeners.content, path),
  );
  route("fileDeleted", (listeners, { path }) =>
    notify(listeners.deleted, path),
  );
  route("fileRenamed", (listeners, { oldPath, newPath }) =>
    notify(listeners.renamed, oldPath, newPath),
  );
}

export class FileSystemSubscription {
  /** The working directory this API is scoped to */
  readonly cwd: string;

  /** Active subscription ID, if subscribed to events */
  private subscriptionId: string | null = null;

  /** Pending subscription promise (to prevent duplicate subscription requests) */
  private subscriptionPromise: Promise<void> | null = null;

  private readonly listeners = new Listeners();

  /** Whether the subscription is stopped until `resume()` */
  private suspended = false;

  /** Whether this instance has been released */
  private released = false;

  /**
   * Subscribes eagerly, so events between construction and the first
   * listener aren't missed.
   */
  constructor(cwd: string) {
    this.cwd = cwd;
    this.ensureSubscribed();
  }

  // ---------------------------------------------------------------------------
  // Event Subscriptions
  // ---------------------------------------------------------------------------

  /** Calls back with a directory's entries each time its listing changes. */
  onDirectoryListingChanged(
    path: string,
    callback: DirectoryListingChangedCallback,
  ): Cleanup {
    this.ensureNotReleased();
    this.ensureSubscribed();
    return addKeyedListener(
      this.listeners.directory,
      normalizePathForKey(path),
      callback,
    );
  }

  /** Calls back with each file whose content changes. */
  onAnyFileContentChanged(callback: FileContentChangedCallback): Cleanup {
    return this.listen(this.listeners.content, callback);
  }

  /** Calls back with each file or directory that's deleted. */
  onAnyFileDeleted(callback: FileDeletedCallback): Cleanup {
    return this.listen(this.listeners.deleted, callback);
  }

  /** Calls back with each file or directory that's renamed or moved. */
  onAnyFileRenamed(callback: FileRenamedCallback): Cleanup {
    return this.listen(this.listeners.renamed, callback);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Unsubscribe until `resume()`. Listeners stay, and hear nothing until then.
   */
  suspend(): void {
    if (this.released || this.suspended) {
      return;
    }
    this.suspended = true;
    this.unsubscribe();
  }

  resume(): void {
    if (this.released || !this.suspended) {
      return;
    }
    this.suspended = false;
    this.ensureSubscribed();
  }

  /** Unsubscribe and drop every listener, after which it can't be used. */
  release(): void {
    if (this.released) {
      return;
    }
    this.released = true;
    this.unsubscribe();
    this.listeners.clear();
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private listen<T>(listeners: Set<T>, callback: T): Cleanup {
    this.ensureNotReleased();
    this.ensureSubscribed();
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }

  /** Unsubscribe from the main process, which also releases its provider. */
  private unsubscribe(): void {
    if (this.subscriptionId) {
      routes.delete(this.subscriptionId);
      window.conduit.files.unsubscribe(this.subscriptionId).catch(() => {
        // Ignore errors during cleanup
      });
      this.subscriptionId = null;
    }
  }

  /**
   * Subscribe unless subscribed, subscribing, suspended or released. A
   * suspension or release that lands while the subscription is in flight
   * unsubscribes it as soon as it arrives.
   */
  private ensureSubscribed(): void {
    if (
      this.subscriptionId ||
      this.subscriptionPromise ||
      this.suspended ||
      this.released
    ) {
      return;
    }

    routeEvents();
    this.subscriptionPromise = window.conduit.files
      .subscribe(this.cwd)
      .then((id) => {
        if (this.suspended || this.released) {
          window.conduit.files.unsubscribe(id).catch(() => {
            // Ignore errors during cleanup
          });
          return;
        }
        this.subscriptionId = id;
        routes.set(id, this.listeners);
      })
      .catch((error: unknown) => {
        console.error("[FileSystemSubscription] Failed to subscribe:", error);
      })
      .finally(() => {
        this.subscriptionPromise = null;
      });
  }

  /**
   * Throw if this instance has been released.
   */
  private ensureNotReleased(): void {
    if (this.released) {
      throw new Error(
        "FileSystemSubscription has been released and cannot be used",
      );
    }
  }
}
