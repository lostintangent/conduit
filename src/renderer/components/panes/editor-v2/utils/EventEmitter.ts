/**
 * EventEmitter - A simple, type-safe event emitter for Editor v2.
 *
 * This implementation follows VS Code's event pattern where:
 * - The emitter owns the event (private `fire()` method)
 * - Consumers subscribe via a public `event` property
 * - Subscriptions return a disposable for cleanup
 *
 * This separation ensures that only the owner can fire events,
 * while consumers can only subscribe/unsubscribe.
 *
 * @example
 * ```typescript
 * class MyRegistry {
 *   // Private emitter - only this class can fire
 *   private readonly _onStateChanged = new EventEmitter<StateEvent>();
 *
 *   // Public event - consumers subscribe here
 *   readonly onStateChanged = this._onStateChanged.event;
 *
 *   updateState() {
 *     this._onStateChanged.fire({ type: 'updated' });
 *   }
 *
 *   dispose() {
 *     this._onStateChanged.dispose();
 *   }
 * }
 *
 * // Consumer:
 * const subscription = registry.onStateChanged((event) => {
 *   console.log('State changed:', event);
 * });
 * subscription.dispose(); // Unsubscribe
 * ```
 */

import type { Disposable, Event } from "../types";

/**
 * A type-safe event emitter.
 *
 * @typeParam T - The type of data passed to event listeners
 */
export class EventEmitter<T> {
  /** Registered listeners */
  private listeners = new Set<(e: T) => void>();

  /** Whether this emitter has been disposed */
  private disposed = false;

  /**
   * The public event property for subscribing.
   *
   * Returns a disposable that removes the listener when disposed.
   */
  readonly event: Event<T> = (listener: (e: T) => void): Disposable => {
    if (this.disposed) {
      // Return a no-op disposable if already disposed
      return { dispose: () => {} };
    }

    this.listeners.add(listener);

    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  };

  /**
   * Fire the event, notifying all listeners.
   *
   * Listeners are called synchronously in insertion order.
   * Errors in listeners are caught and logged to prevent one
   * bad listener from breaking others.
   *
   * @param data - The event data to pass to listeners
   */
  fire(data: T): void {
    if (this.disposed) {
      return;
    }

    // Create a copy to avoid issues if a listener unsubscribes during iteration
    const snapshot = [...this.listeners];

    for (const listener of snapshot) {
      try {
        listener(data);
      } catch (error) {
        console.error("[EventEmitter] Listener threw an error:", error);
      }
    }
  }

  /**
   * Check if there are any registered listeners.
   */
  hasListeners(): boolean {
    return this.listeners.size > 0;
  }

  /**
   * Get the number of registered listeners.
   */
  get listenerCount(): number {
    return this.listeners.size;
  }

  /**
   * Dispose the emitter, clearing all listeners.
   *
   * After disposal:
   * - All existing listeners are removed
   * - New subscriptions return no-op disposables
   * - fire() becomes a no-op
   */
  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }
}
