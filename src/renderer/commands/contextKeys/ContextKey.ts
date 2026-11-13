import type { WhenClause } from "../whenClauses/WhenClause";

/**
 * Represents a context key that can be evaluated in when clauses
 */
export class ContextKey<T> {
  constructor(
    public readonly key: string,
    public readonly defaultValue: T,
  ) {}

  /**
   * Create when clause: key === true
   */
  isTrue(): WhenClause {
    return {
      evaluate: (ctx) => {
        const value = ctx[this.key] ?? this.defaultValue;
        return value === true;
      },
      toString: () => this.key,
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
      toString: () => `!${this.key}`,
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
      toString: () => `${this.key} == ${JSON.stringify(value)}`,
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
      toString: () => `${this.key} > ${value}`,
    };
  }
}
