/**
 * EventEmitter - A simple, type-safe event emitter implementation.
 *
 * This implementation follows VS Code's event pattern where:
 * - The emitter owns the event (private `fire()` method)
 * - Consumers subscribe via a public `event` property
 * - Subscriptions return a disposable for cleanup
 *
 * This separation of concerns ensures that only the owner can fire events,
 * while consumers can only subscribe/unsubscribe.
 *
 * @example
 * ```typescript
 * // In a provider class:
 * class MyProvider {
 *   // Private emitter - only this class can fire
 *   private readonly _onDataChanged = new EventEmitter<string>();
 *
 *   // Public event - consumers subscribe here
 *   readonly onDataChanged = this._onDataChanged.event;
 *
 *   doSomething() {
 *     // Fire the event
 *     this._onDataChanged.fire('new data');
 *   }
 *
 *   dispose() {
 *     this._onDataChanged.dispose();
 *   }
 * }
 *
 * // Consumer code:
 * const provider = new MyProvider();
 * const subscription = provider.onDataChanged((data) => {
 *   console.log('Data changed:', data);
 * });
 *
 * // Later, to unsubscribe:
 * subscription.dispose();
 * ```
 *
 * @see docs/architecture/filesystem-provider-design-narrative.md (Appendix C)
 */

import type { Disposable, Event } from "./types";

/**
 * A type-safe event emitter.
 *
 * @typeParam T - The type of data passed to event listeners
 */
export class EventEmitter<T> {
  /**
   * Set of registered listeners.
   *
   * Using a Set ensures:
   * - O(1) add/remove operations
   * - No duplicate listeners
   * - Iteration order matches insertion order
   */
  private listeners = new Set<(e: T) => void>();

  /**
   * Whether this emitter has been disposed.
   *
   * Once disposed, no new listeners can be added and fire() is a no-op.
   */
  private disposed = false;

  /**
   * The public event property for subscribing.
   *
   * This is a function that takes a listener and returns a disposable.
   * Consumers use this to subscribe to events.
   *
   * @example
   * ```typescript
   * const subscription = emitter.event((data) => {
   *   console.log('Received:', data);
   * });
   * ```
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

    // Create a copy of listeners to avoid issues if a listener
    // unsubscribes during iteration
    const listenersSnapshot = [...this.listeners];

    for (const listener of listenersSnapshot) {
      try {
        listener(data);
      } catch (error) {
        // Log but don't throw - one bad listener shouldn't break others
        console.error("[EventEmitter] Listener threw an error:", error);
      }
    }
  }

  /**
   * Check if there are any registered listeners.
   *
   * Useful for optimization - skip work if no one is listening.
   */
  hasListeners(): boolean {
    return this.listeners.size > 0;
  }

  /**
   * Get the number of registered listeners.
   *
   * Useful for debugging and testing.
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
   *
   * This should be called when the owning object is disposed
   * to prevent memory leaks.
   */
  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }
}
