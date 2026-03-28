import type { WhenClause } from "./WhenClause";

/**
 * Builder for creating when clause expressions
 */
export const When = {
  /**
   * Logical AND - all expressions must be true
   */
  and(...exprs: WhenClause[]): WhenClause {
    return {
      evaluate: (ctx) => exprs.every((expr) => expr.evaluate(ctx)),
      toString: () => {
        if (exprs.length === 0) return "true";
        if (exprs.length === 1) return exprs[0].toString();
        return `(${exprs.map((e) => e.toString()).join(" && ")})`;
      },
    };
  },

  /**
   * Logical OR - at least one expression must be true
   */
  or(...exprs: WhenClause[]): WhenClause {
    return {
      evaluate: (ctx) => exprs.some((expr) => expr.evaluate(ctx)),
      toString: () => {
        if (exprs.length === 0) return "false";
        if (exprs.length === 1) return exprs[0].toString();
        return `(${exprs.map((e) => e.toString()).join(" || ")})`;
      },
    };
  },

  /**
   * Logical NOT - inverts the expression
   */
  not(expr: WhenClause): WhenClause {
    return {
      evaluate: (ctx) => !expr.evaluate(ctx),
      toString: () => `!${expr.toString()}`,
    };
  },

  /**
   * Always true
   */
  always(): WhenClause {
    return {
      evaluate: () => true,
      toString: () => "true",
    };
  },

  /**
   * Always false
   */
  never(): WhenClause {
    return {
      evaluate: () => false,
      toString: () => "false",
    };
  },
};
