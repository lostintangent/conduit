/**
 * Ref-counted pool that lets React components with the same cwd share one API
 * instance, so there is one IPC subscription per cwd.
 *
 * - `acquire()` increments the refCount, `release()` decrements it.
 * - When the refCount reaches 0 the instance is disposed after a 5s grace
 *   period (matching the backend), which avoids thrashing on rapid
 *   mount/unmount cycles such as tab switches. Re-acquiring cancels disposal.
 * - Trailing slashes are stripped so "/project" and "/project/" share an
 *   instance; `normalizeKey` can additionally fold case.
 *
 * @see FileSystemProviderService / GitProviderService - backend equivalents
 */

import { useEffect, useRef } from "react";

const GRACE_PERIOD_MS = 5000;

interface ManagedInstance<T> {
  api: T;
  refCount: number;
  disposeTimer?: ReturnType<typeof setTimeout>;
}

export class SharedAPIPool<T extends { release(): void }> {
  private instances = new Map<string, ManagedInstance<T>>();

  constructor(
    private readonly create: (cwd: string) => T,
    private readonly normalizeKey: (path: string) => string = (path) => path,
  ) {}

  acquire(cwd: string): T {
    const key = this.makeKey(cwd);
    const existing = this.instances.get(key);

    if (existing) {
      clearTimeout(existing.disposeTimer);
      existing.disposeTimer = undefined;
      existing.refCount++;
      return existing.api;
    }

    const api = this.create(cwd);
    this.instances.set(key, { api, refCount: 1 });
    return api;
  }

  release(cwd: string): void {
    const key = this.makeKey(cwd);
    const managed = this.instances.get(key);
    if (!managed) {
      return;
    }

    // An extra release would leave an orphaned grace timer that disposes the
    // instance after a later acquire.
    if (managed.refCount === 0) {
      console.warn(`[SharedAPIPool] Released more than acquired: ${key}`);
      return;
    }

    managed.refCount--;
    if (managed.refCount === 0) {
      managed.disposeTimer = setTimeout(
        () => this.dispose(key),
        GRACE_PERIOD_MS,
      );
    }
  }

  /** Test-only introspection. */
  getRefCount(cwd: string): number {
    return this.instances.get(this.makeKey(cwd))?.refCount ?? 0;
  }

  /** Test-only introspection (true even during the grace period). */
  hasInstance(cwd: string): boolean {
    return this.instances.has(this.makeKey(cwd));
  }

  disposeAll(): void {
    for (const key of this.instances.keys()) {
      this.dispose(key);
    }
  }

  private dispose(key: string): void {
    const managed = this.instances.get(key);
    if (!managed) {
      return;
    }

    clearTimeout(managed.disposeTimer);
    managed.api.release();
    this.instances.delete(key);
  }

  private makeKey(cwd: string): string {
    return this.normalizeKey(cwd.replace(/\/+$/, ""));
  }
}

/** Lazily-created singleton pool with a test reset hook. */
export function createSharedAPIPool<T extends { release(): void }>(
  create: (cwd: string) => T,
  normalizeKey?: (path: string) => string,
) {
  let instance: SharedAPIPool<T> | null = null;
  return {
    getInstance: (): SharedAPIPool<T> =>
      (instance ??= new SharedAPIPool(create, normalizeKey)),
    resetInstance: (): void => {
      instance?.disposeAll();
      instance = null;
    },
  };
}

/**
 * Hold a reference to the pool's instance for `cwd` while the component is
 * mounted, swapping references when `cwd` changes.
 */
export function useSharedAPI<T extends { release(): void }>(
  pool: SharedAPIPool<T>,
  cwd: string,
): T {
  const normalizedCwd = cwd.replace(/\/+$/, "");
  const acquiredRef = useRef<{ cwd: string; api: T } | null>(null);

  if (acquiredRef.current?.cwd !== normalizedCwd) {
    const previous = acquiredRef.current;
    if (previous) {
      pool.release(previous.cwd);
    }
    acquiredRef.current = {
      cwd: normalizedCwd,
      api: pool.acquire(normalizedCwd),
    };
  }

  useEffect(() => {
    return () => {
      const acquired = acquiredRef.current;
      if (acquired) {
        pool.release(acquired.cwd);
        acquiredRef.current = null;
      }
    };
  }, []);

  return acquiredRef.current.api;
}
