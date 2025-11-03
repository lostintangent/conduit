import type { ContextValues } from "./types";

/**
 * Service for managing hierarchical context keys
 */
export interface IContextKeyService {
  /**
   * Set a value on a specific pane
   * Triggers automatic aggregation to tab/global levels
   */
  setPaneProperty(paneId: string, key: string, value: unknown): void;

  /**
   * Set a value on a specific tab
   * Triggers automatic aggregation to global level
   */
  setTabProperty(tabId: string, key: string, value: unknown): void;

  /**
   * Set a global value
   */
  setGlobal(key: string, value: unknown): void;

  /**
   * Get current value for a context key
   */
  get<T = unknown>(key: string): T | undefined;

  /**
   * Get all current context values
   */
  getAll(): ContextValues;

  /**
   * Subscribe to context changes
   */
  onDidChangeContext(
    listener: (key: string, value: unknown) => void,
  ): () => void;
}
