export * from "./agent";
export * from "./git";
export * from "./layout";
export * from "./panes";
export * from "./settings";
export * from "./terminal";
export * from "./ui";
export * from "./updates";
export * from "./vm";
export * from "./workspace";

/* Event System Types */

/**
 * Disposable - An object that can be disposed to clean up resources.
 *
 * Common pattern for cleanup in VS Code-style APIs.
 */
export interface Disposable {
  dispose(): void;
}

/**
 * Event - A function that registers a listener and returns a disposable.
 *
 * This is the VS Code event pattern where:
 * - Consumers call the event function with a listener
 * - The function returns a Disposable for cleanup
 * - Only the event owner can fire events
 *
 * @typeParam T - The type of data passed to the listener
 */
export type Event<T> = (listener: (e: T) => void) => Disposable;
