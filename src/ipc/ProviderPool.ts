/**
 * Ref-counted pool of providers keyed by path, shared by FileSystemProviderService
 * and GitProviderService.
 *
 * - Keys are resolved and lowercased, since the macOS filesystem is
 *   case-insensitive.
 * - Concurrent acquires for one key share a single creation.
 * - When the refCount reaches 0, `onIdle` runs and the provider is disposed
 *   after a 5s grace period. Re-acquiring within it cancels disposal and runs
 *   `onRevive`.
 *
 * @see SharedAPIPool - the renderer equivalent
 */

import * as path from "node:path";

const DISPOSE_GRACE_PERIOD_MS = 5000;

interface PoolEntry<T> {
  value: T;
  refCount: number;
  disposeTimer?: NodeJS.Timeout;
}

interface PoolHooks<T> {
  dispose: (value: T) => void | Promise<void>;
  onIdle?: (value: T) => void;
  onRevive?: (value: T, key: string) => void;
}

export function toProviderKey(filePath: string): string {
  return path.resolve(filePath).toLowerCase();
}

export class ProviderPool<T> {
  private entries = new Map<string, PoolEntry<T>>();
  private pendingCreations = new Map<string, Promise<T>>();

  constructor(
    private readonly name: string,
    private readonly hooks: PoolHooks<T>,
  ) {}

  async acquire(
    filePath: string,
    create: (key: string) => Promise<T>,
  ): Promise<T> {
    const key = toProviderKey(filePath);
    const existing = this.entries.get(key);
    if (existing) {
      if (existing.disposeTimer) {
        clearTimeout(existing.disposeTimer);
        existing.disposeTimer = undefined;
        this.hooks.onRevive?.(existing.value, key);
      }
      existing.refCount++;
      return existing.value;
    }

    const pendingCreation = this.pendingCreations.get(key);
    if (pendingCreation) {
      const value = await pendingCreation;
      const entry = this.entries.get(key);
      if (entry) {
        entry.refCount++;
      }
      return value;
    }

    const creation = create(key).then((value) => {
      this.entries.set(key, { value, refCount: 1 });
      return value;
    });
    this.pendingCreations.set(key, creation);
    try {
      return await creation;
    } finally {
      this.pendingCreations.delete(key);
    }
  }

  release(filePath: string): void {
    const key = toProviderKey(filePath);
    const entry = this.entries.get(key);
    if (!entry) {
      console.warn(
        `[${this.name}] Attempted to release unknown provider: ${key}`,
      );
      return;
    }

    entry.refCount--;
    if (entry.refCount <= 0) {
      this.hooks.onIdle?.(entry.value);
      entry.disposeTimer = setTimeout(
        () => this.dispose(key),
        DISPOSE_GRACE_PERIOD_MS,
      );
    }
  }

  /** Get a provider without taking a reference. */
  get(filePath: string): T | undefined {
    return this.entries.get(toProviderKey(filePath))?.value;
  }

  refCount(filePath: string): number {
    return this.entries.get(toProviderKey(filePath))?.refCount ?? 0;
  }

  has(filePath: string): boolean {
    return this.entries.has(toProviderKey(filePath));
  }

  get size(): number {
    return this.entries.size;
  }

  /** Dispose a provider now, skipping the grace period. */
  async dispose(filePath: string): Promise<void> {
    const key = toProviderKey(filePath);
    const entry = this.entries.get(key);
    if (!entry) {
      return;
    }

    clearTimeout(entry.disposeTimer);
    this.entries.delete(key);
    await this.hooks.dispose(entry.value);
  }

  disposeAll(): void {
    for (const [key, entry] of this.entries) {
      clearTimeout(entry.disposeTimer);
      const logError = (error: unknown) =>
        console.error(`[${this.name}] Error disposing provider ${key}:`, error);
      try {
        Promise.resolve(this.hooks.dispose(entry.value)).catch(logError);
      } catch (error) {
        logError(error);
      }
    }
    this.entries.clear();
  }
}
