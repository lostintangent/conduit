/**
 * Ref-counted pool that gives everything using the same cwd one subscription
 * instance, so there is one IPC subscription per cwd.
 *
 * - An instance lasts as long as the pool, so a reference taken during render
 *   stays usable for however long its component is hidden.
 * - `acquire()` and `release()` count its holders. Once it has none for 5s
 *   (matching the backend), it suspends its subscription, and the next
 *   acquire resumes it. The grace period avoids thrashing on rapid
 *   mount/unmount cycles such as tab switches.
 * - Trailing slashes are stripped so "/project" and "/project/" share an
 *   instance; `normalizeKey` can additionally fold case.
 *
 * @see FileSystemProviderService / GitProviderService - backend equivalents
 */

import { useEffect } from "react";

const GRACE_PERIOD_MS = 5000;

/** A subscription that can stop and restart, keeping its listeners. */
export interface PooledSubscription {
  suspend(): void;
  resume(): void;
  /** Stop for good. */
  release(): void;
}

interface ManagedInstance<T> {
  subscription: T;
  refCount: number;
  suspendTimer?: ReturnType<typeof setTimeout>;
}

export class SubscriptionPool<T extends PooledSubscription> {
  private instances = new Map<string, ManagedInstance<T>>();

  constructor(
    private readonly create: (cwd: string) => T,
    private readonly normalizeKey: (path: string) => string = (path) => path,
  ) {}

  /**
   * The instance for `cwd`, without holding it. One created here suspends
   * after the grace period unless something acquires it.
   */
  get(cwd: string): T {
    return this.managed(cwd).subscription;
  }

  acquire(cwd: string): T {
    const managed = this.managed(cwd);
    clearTimeout(managed.suspendTimer);
    managed.suspendTimer = undefined;
    if (managed.refCount++ === 0) {
      managed.subscription.resume();
    }
    return managed.subscription;
  }

  release(cwd: string): void {
    const key = this.makeKey(cwd);
    const managed = this.instances.get(key);
    if (!managed) {
      return;
    }

    // An extra release would leave an orphaned grace timer that suspends the
    // instance after a later acquire.
    if (managed.refCount === 0) {
      console.warn(`[SubscriptionPool] Released more than acquired: ${key}`);
      return;
    }

    managed.refCount--;
    if (managed.refCount === 0) {
      this.suspendLater(managed);
    }
  }

  /** Test-only introspection. */
  getRefCount(cwd: string): number {
    return this.instances.get(this.makeKey(cwd))?.refCount ?? 0;
  }

  /** Test-only introspection. */
  hasInstance(cwd: string): boolean {
    return this.instances.has(this.makeKey(cwd));
  }

  disposeAll(): void {
    for (const managed of this.instances.values()) {
      clearTimeout(managed.suspendTimer);
      managed.subscription.release();
    }
    this.instances.clear();
  }

  private managed(cwd: string): ManagedInstance<T> {
    const key = this.makeKey(cwd);
    let managed = this.instances.get(key);
    if (!managed) {
      managed = { subscription: this.create(cwd), refCount: 0 };
      this.instances.set(key, managed);
      this.suspendLater(managed);
    }
    return managed;
  }

  private suspendLater(managed: ManagedInstance<T>): void {
    managed.suspendTimer = setTimeout(() => {
      managed.suspendTimer = undefined;
      managed.subscription.suspend();
    }, GRACE_PERIOD_MS);
  }

  private makeKey(cwd: string): string {
    return this.normalizeKey(cwd.replace(/\/+$/, ""));
  }
}

/** Lazily-created singleton pool with a test reset hook. */
export function createSubscriptionPool<T extends PooledSubscription>(
  create: (cwd: string) => T,
  normalizeKey?: (path: string) => string,
) {
  let instance: SubscriptionPool<T> | null = null;
  return {
    getInstance: (): SubscriptionPool<T> =>
      (instance ??= new SubscriptionPool(create, normalizeKey)),
    resetInstance: (): void => {
      instance?.disposeAll();
      instance = null;
    },
  };
}

/**
 * The pool's instance for `cwd`, held while the component is mounted and
 * shown. Holding it is an effect, so a hidden `<Activity>` lets go of it and
 * takes it back when it's shown again, which re-runs effects but not render.
 * The instance is the same either way.
 */
export function usePooledSubscription<T extends PooledSubscription>(
  pool: SubscriptionPool<T>,
  cwd: string,
): T {
  const normalizedCwd = cwd.replace(/\/+$/, "");

  useEffect(() => {
    pool.acquire(normalizedCwd);
    return () => pool.release(normalizedCwd);
  }, [pool, normalizedCwd]);

  return pool.get(normalizedCwd);
}
