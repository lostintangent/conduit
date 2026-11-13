import type { ContextValues } from "./types";

type ContextChangeListener = (key: string, value: unknown) => void;

/**
 * Flat store of context key values evaluated by when clauses
 */
export class ContextKeyService {
  private values: ContextValues = {};
  private listeners = new Set<ContextChangeListener>();

  setGlobal(key: string, value: unknown): void {
    if (this.values[key] === value) {
      return;
    }
    this.values[key] = value;
    for (const listener of this.listeners) {
      listener(key, value);
    }
  }

  getAll(): ContextValues {
    return { ...this.values };
  }

  onDidChangeContext(listener: ContextChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
