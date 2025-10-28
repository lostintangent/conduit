import { AggregateMode } from './types';

/**
 * Represents a context key whose value is automatically aggregated from child keys
 */
export class DerivedContextKey {
  constructor(
    public readonly key: string,
    public readonly sourceKey: string,
    public readonly aggregateMode: AggregateMode
  ) {}

  /**
   * Get the full key path
   */
  getKey(): string {
    return this.key;
  }

  /**
   * Get the source key that this derives from
   */
  getSourceKey(): string {
    return this.sourceKey;
  }

  /**
   * Get the aggregation mode
   */
  getAggregateMode(): AggregateMode {
    return this.aggregateMode;
  }

  // When clause methods will be added in Phase 2
}
