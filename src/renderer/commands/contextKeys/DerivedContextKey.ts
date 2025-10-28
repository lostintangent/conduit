import { AggregateMode } from './types';
import type { WhenClause } from '../whenClauses/WhenClause';

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

  /**
   * Create when clause: key is truthy
   */
  toWhenClause(): WhenClause {
    return {
      evaluate: (ctx) => {
        const value = ctx[this.key];
        return !!value;
      },
      toString: () => this.key
    };
  }

  /**
   * Create when clause: key === true
   */
  isTrue(): WhenClause {
    return {
      evaluate: (ctx) => {
        const value = ctx[this.key];
        return value === true;
      },
      toString: () => this.key
    };
  }

  /**
   * Create when clause: key === false
   */
  isFalse(): WhenClause {
    return {
      evaluate: (ctx) => {
        const value = ctx[this.key];
        return value === false;
      },
      toString: () => `!${this.key}`
    };
  }

  /**
   * Create when clause: key is defined (not undefined)
   */
  isDefined(): WhenClause {
    return {
      evaluate: (ctx) => ctx[this.key] !== undefined,
      toString: () => this.key
    };
  }

  /**
   * Create when clause: key is undefined
   */
  isUndefined(): WhenClause {
    return {
      evaluate: (ctx) => ctx[this.key] === undefined,
      toString: () => `!${this.key}`
    };
  }

  /**
   * Create when clause: key equals value
   */
  equals(value: unknown): WhenClause {
    return {
      evaluate: (ctx) => {
        const currentValue = ctx[this.key];
        return currentValue === value;
      },
      toString: () => `${this.key} == ${JSON.stringify(value)}`
    };
  }

  /**
   * Create when clause: key does not equal value
   */
  notEquals(value: unknown): WhenClause {
    return {
      evaluate: (ctx) => {
        const currentValue = ctx[this.key];
        return currentValue !== value;
      },
      toString: () => `${this.key} != ${JSON.stringify(value)}`
    };
  }

  /**
   * Create when clause: key > value (for numbers)
   */
  greaterThan(value: unknown): WhenClause {
    return {
      evaluate: (ctx) => {
        const currentValue = ctx[this.key];
        return (currentValue as any) > (value as any);
      },
      toString: () => `${this.key} > ${value}`
    };
  }

  /**
   * Create when clause: key >= value (for numbers)
   */
  greaterThanOrEqual(value: unknown): WhenClause {
    return {
      evaluate: (ctx) => {
        const currentValue = ctx[this.key];
        return (currentValue as any) >= (value as any);
      },
      toString: () => `${this.key} >= ${value}`
    };
  }

  /**
   * Create when clause: key < value (for numbers)
   */
  lessThan(value: unknown): WhenClause {
    return {
      evaluate: (ctx) => {
        const currentValue = ctx[this.key];
        return (currentValue as any) < (value as any);
      },
      toString: () => `${this.key} < ${value}`
    };
  }

  /**
   * Create when clause: key <= value (for numbers)
   */
  lessThanOrEqual(value: unknown): WhenClause {
    return {
      evaluate: (ctx) => {
        const currentValue = ctx[this.key];
        return (currentValue as any) <= (value as any);
      },
      toString: () => `${this.key} <= ${value}`
    };
  }

  /**
   * Create when clause: key matches regex (for strings)
   */
  matches(pattern: RegExp): WhenClause {
    return {
      evaluate: (ctx) => {
        const value = ctx[this.key];
        if (typeof value !== 'string') return false;
        return pattern.test(value);
      },
      toString: () => `${this.key} =~ ${pattern.toString()}`
    };
  }

  /**
   * Create when clause: NOT this key
   */
  negate(): WhenClause {
    return {
      evaluate: (ctx) => {
        const value = ctx[this.key];
        return !value;
      },
      toString: () => `!${this.key}`
    };
  }
}
