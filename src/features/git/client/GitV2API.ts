/**
 * A cwd's git subscription, for the renderer. Each instance subscribes as
 * it's created, which keeps the repository's watcher running and its events
 * flowing until it's released. Reads and writes call `window.conduit.git` by
 * cwd (see `gitQueries` and `gitMutations`), and use an instance only to wait
 * for its watcher and to tell whether it has kept their cache current.
 *
 * Instances for different cwds in one repository share its provider in main.
 */

import type { GitStatusChangedEvent } from "../model";

/** The cwd behind each live subscription, so one listener can route events */
const subscriptionCwds = new Map<string, string>();

/** The cwd a live subscription was made for, by its id. */
export function cwdForGitSubscription(
  subscriptionId: string,
): string | undefined {
  return subscriptionCwds.get(subscriptionId);
}

export class GitV2API {
  readonly cwd: string;

  private subscriptionId: string | null = null;

  private _watchedSince: number | null = null;

  /** The subscription in flight, so there's only ever one. */
  private subscriptionPromise: Promise<void> | null = null;

  private released = false;

  constructor(cwd: string) {
    this.cwd = cwd;
    this.ensureSubscribed();
  }

  /**
   * Resolves once the subscription is live, or once it's failed, so a read
   * that waits for it can't miss a change made in between.
   */
  async whenReady(): Promise<void> {
    await this.subscriptionPromise;
  }

  /**
   * When this instance's watcher went live, or null while it has none (still
   * subscribing, released, or outside a repository).
   */
  get watchedSince(): number | null {
    return this._watchedSince;
  }

  /** Calls back with each status this instance's watcher reports. */
  onStatusChanged(
    callback: (event: GitStatusChangedEvent) => void,
  ): () => void {
    this.ensureNotReleased();
    this.ensureSubscribed();
    return window.conduit.git.on("statusChanged", (event) => {
      if (event.subscriptionId !== this.subscriptionId) {
        return;
      }
      // A throw would skip the channel's later listeners
      try {
        callback(event);
      } catch (error) {
        console.error("[GitV2API] Error in status listener:", error);
      }
    });
  }

  /** Unsubscribe, after which the instance can't be used. */
  release(): void {
    if (this.released) {
      return;
    }
    this.released = true;

    if (this.subscriptionId) {
      subscriptionCwds.delete(this.subscriptionId);
      window.conduit.git.unsubscribe(this.subscriptionId).catch(() => {
        // Ignore errors during cleanup
      });
      this.subscriptionId = null;
      this._watchedSince = null;
    }
  }

  /**
   * Subscribe unless subscribed or subscribing. A release that lands while
   * the subscription is in flight unsubscribes it as soon as it arrives.
   */
  private ensureSubscribed(): void {
    if (this.subscriptionId || this.subscriptionPromise) {
      return;
    }

    this.subscriptionPromise = (async () => {
      try {
        const subscriptionId = await window.conduit.git.subscribe(this.cwd);
        if (!subscriptionId) {
          return; // Not a git repository
        }

        if (this.released) {
          window.conduit.git.unsubscribe(subscriptionId).catch(() => {
            // Ignore errors during cleanup
          });
          return;
        }

        this.subscriptionId = subscriptionId;
        this._watchedSince = Date.now();
        subscriptionCwds.set(subscriptionId, this.cwd);
      } catch (error) {
        console.error("[GitV2API] Failed to subscribe:", error);
      } finally {
        this.subscriptionPromise = null;
      }
    })();
  }

  private ensureNotReleased(): void {
    if (this.released) {
      throw new Error("GitV2API has been released and cannot be used");
    }
  }
}
