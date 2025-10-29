/**
 * Defines the level at which a context key's source of truth exists
 */
export enum ContextLevel {
  /** Pane-level keys (set per-pane) */
  Pane = 'pane',

  /** Tab-level keys (set per-tab) */
  Tab = 'tab',

  /** Global-level keys (set globally) */
  Global = 'global'
}

/**
 * Defines how child values aggregate to parent levels
 */
export enum AggregateMode {
  /** Parent true if ANY child is true (OR) */
  Any = 'any',

  /** Parent true if ALL children are true (AND) */
  All = 'all',

  /** Parent = count of truthy children */
  Count = 'count',

  /** Parent = active child's value (no aggregation) */
  First = 'first'
}

/**
 * Configuration for a context key
 */
export interface ContextKeyConfig {
  /** The level at which this key's source of truth exists */
  level: ContextLevel;

  /** How to aggregate child values to parent levels (if applicable) */
  aggregate?: AggregateMode;
}

/**
 * Current context values (key-value store)
 */
export interface ContextValues {
  [key: string]: unknown;
}
