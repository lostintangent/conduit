import type { ContextKeyConfig } from './types';

/**
 * Represents a context key that can be evaluated in when clauses
 */
export class ContextKey<T> {
  constructor(
    public readonly key: string,
    public readonly defaultValue: T,
    public readonly config?: ContextKeyConfig
  ) {}

  /**
   * Get the full key path (including prefixes like activePane., activeTab.)
   */
  getKey(): string {
    return this.key;
  }

  /**
   * Get the default value for this key
   */
  getDefault(): T {
    return this.defaultValue;
  }

  /**
   * Get the configuration for this key
   */
  getConfig(): ContextKeyConfig | undefined {
    return this.config;
  }

  // When clause methods will be added in Phase 2
}
