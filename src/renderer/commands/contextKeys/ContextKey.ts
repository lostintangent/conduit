import type { ContextKeyConfig } from './types';
import type { WhenClause } from '../whenClauses/WhenClause';

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

  /**
   * Create when clause: key is truthy
   */
  toWhenClause(): WhenClause {
    return {
      evaluate: (ctx) => {
        const value = ctx[this.key] ?? this.defaultValue;
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
        const value = ctx[this.key] ?? this.defaultValue;
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
        const value = ctx[this.key] ?? this.defaultValue;
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
  equals(value: T): WhenClause {
    return {
      evaluate: (ctx) => {
        const currentValue = ctx[this.key] ?? this.defaultValue;
        return currentValue === value;
      },
      toString: () => `${this.key} == ${JSON.stringify(value)}`
    };
  }

  /**
   * Create when clause: key does not equal value
   */
  notEquals(value: T): WhenClause {
    return {
      evaluate: (ctx) => {
        const currentValue = ctx[this.key] ?? this.defaultValue;
        return currentValue !== value;
      },
      toString: () => `${this.key} != ${JSON.stringify(value)}`
    };
  }

  /**
   * Create when clause: key > value (for numbers)
   */
  greaterThan(value: T): WhenClause {
    return {
      evaluate: (ctx) => {
        const currentValue = ctx[this.key] ?? this.defaultValue;
        return (currentValue as any) > (value as any);
      },
      toString: () => `${this.key} > ${value}`
    };
  }

  /**
   * Create when clause: key >= value (for numbers)
   */
  greaterThanOrEqual(value: T): WhenClause {
    return {
      evaluate: (ctx) => {
        const currentValue = ctx[this.key] ?? this.defaultValue;
        return (currentValue as any) >= (value as any);
      },
      toString: () => `${this.key} >= ${value}`
    };
  }

  /**
   * Create when clause: key < value (for numbers)
   */
  lessThan(value: T): WhenClause {
    return {
      evaluate: (ctx) => {
        const currentValue = ctx[this.key] ?? this.defaultValue;
        return (currentValue as any) < (value as any);
      },
      toString: () => `${this.key} < ${value}`
    };
  }

  /**
   * Create when clause: key <= value (for numbers)
   */
  lessThanOrEqual(value: T): WhenClause {
    return {
      evaluate: (ctx) => {
        const currentValue = ctx[this.key] ?? this.defaultValue;
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
        const value = ctx[this.key] ?? this.defaultValue;
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
        const value = ctx[this.key] ?? this.defaultValue;
        return !value;
      },
      toString: () => `!${this.key}`
    };
  }
}
