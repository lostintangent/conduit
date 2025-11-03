import { describe, it, expect } from "vitest";
import { When } from "@/commands/whenClauses/When";

describe("When.and()", () => {
  it("should return true when all expressions are true", () => {
    const expr1 = { evaluate: () => true, toString: () => "expr1" };
    const expr2 = { evaluate: () => true, toString: () => "expr2" };
    const andClause = When.and(expr1, expr2);

    expect(andClause.evaluate({})).toBe(true);
  });

  it("should return false when one expression is false", () => {
    const expr1 = { evaluate: () => true, toString: () => "expr1" };
    const expr2 = { evaluate: () => false, toString: () => "expr2" };
    const andClause = When.and(expr1, expr2);

    expect(andClause.evaluate({})).toBe(false);
  });

  it("should return false when all expressions are false", () => {
    const expr1 = { evaluate: () => false, toString: () => "expr1" };
    const expr2 = { evaluate: () => false, toString: () => "expr2" };
    const andClause = When.and(expr1, expr2);

    expect(andClause.evaluate({})).toBe(false);
  });

  it("should return true for empty array", () => {
    const andClause = When.and();
    expect(andClause.evaluate({})).toBe(true);
  });

  it("should return single expression result for single item", () => {
    const expr = { evaluate: () => true, toString: () => "expr" };
    const andClause = When.and(expr);

    expect(andClause.evaluate({})).toBe(true);
  });

  it("should format toString correctly", () => {
    const expr1 = { evaluate: () => true, toString: () => "a" };
    const expr2 = { evaluate: () => true, toString: () => "b" };
    const andClause = When.and(expr1, expr2);

    expect(andClause.toString()).toBe("(a && b)");
  });

  it("should format toString for single expression without parentheses", () => {
    const expr = { evaluate: () => true, toString: () => "expr" };
    const andClause = When.and(expr);

    expect(andClause.toString()).toBe("expr");
  });

  it("should format toString for empty as true", () => {
    const andClause = When.and();
    expect(andClause.toString()).toBe("true");
  });
});

describe("When.or()", () => {
  it("should return true when one expression is true", () => {
    const expr1 = { evaluate: () => false, toString: () => "expr1" };
    const expr2 = { evaluate: () => true, toString: () => "expr2" };
    const orClause = When.or(expr1, expr2);

    expect(orClause.evaluate({})).toBe(true);
  });

  it("should return true when all expressions are true", () => {
    const expr1 = { evaluate: () => true, toString: () => "expr1" };
    const expr2 = { evaluate: () => true, toString: () => "expr2" };
    const orClause = When.or(expr1, expr2);

    expect(orClause.evaluate({})).toBe(true);
  });

  it("should return false when all expressions are false", () => {
    const expr1 = { evaluate: () => false, toString: () => "expr1" };
    const expr2 = { evaluate: () => false, toString: () => "expr2" };
    const orClause = When.or(expr1, expr2);

    expect(orClause.evaluate({})).toBe(false);
  });

  it("should return false for empty array", () => {
    const orClause = When.or();
    expect(orClause.evaluate({})).toBe(false);
  });

  it("should return single expression result for single item", () => {
    const expr = { evaluate: () => true, toString: () => "expr" };
    const orClause = When.or(expr);

    expect(orClause.evaluate({})).toBe(true);
  });

  it("should format toString correctly", () => {
    const expr1 = { evaluate: () => true, toString: () => "a" };
    const expr2 = { evaluate: () => true, toString: () => "b" };
    const orClause = When.or(expr1, expr2);

    expect(orClause.toString()).toBe("(a || b)");
  });

  it("should format toString for single expression without parentheses", () => {
    const expr = { evaluate: () => true, toString: () => "expr" };
    const orClause = When.or(expr);

    expect(orClause.toString()).toBe("expr");
  });

  it("should format toString for empty as false", () => {
    const orClause = When.or();
    expect(orClause.toString()).toBe("false");
  });
});

describe("When.not()", () => {
  it("should invert true to false", () => {
    const expr = { evaluate: () => true, toString: () => "expr" };
    const notClause = When.not(expr);

    expect(notClause.evaluate({})).toBe(false);
  });

  it("should invert false to true", () => {
    const expr = { evaluate: () => false, toString: () => "expr" };
    const notClause = When.not(expr);

    expect(notClause.evaluate({})).toBe(true);
  });

  it("should format toString correctly", () => {
    const expr = { evaluate: () => true, toString: () => "expr" };
    const notClause = When.not(expr);

    expect(notClause.toString()).toBe("!expr");
  });
});

describe("When.always()", () => {
  it("should always return true", () => {
    const alwaysClause = When.always();
    expect(alwaysClause.evaluate({})).toBe(true);
  });

  it("should format toString as true", () => {
    const alwaysClause = When.always();
    expect(alwaysClause.toString()).toBe("true");
  });
});

describe("When.never()", () => {
  it("should always return false", () => {
    const neverClause = When.never();
    expect(neverClause.evaluate({})).toBe(false);
  });

  it("should format toString as false", () => {
    const neverClause = When.never();
    expect(neverClause.toString()).toBe("false");
  });
});

describe("nested expressions", () => {
  it("should handle and within or", () => {
    const a = { evaluate: () => true, toString: () => "a" };
    const b = { evaluate: () => false, toString: () => "b" };
    const c = { evaluate: () => true, toString: () => "c" };

    const andClause = When.and(a, b);
    const orClause = When.or(andClause, c);

    // (true && false) || true = false || true = true
    expect(orClause.evaluate({})).toBe(true);
    expect(orClause.toString()).toBe("((a && b) || c)");
  });

  it("should handle or within and", () => {
    const a = { evaluate: () => true, toString: () => "a" };
    const b = { evaluate: () => false, toString: () => "b" };
    const c = { evaluate: () => true, toString: () => "c" };

    const orClause = When.or(a, b);
    const andClause = When.and(orClause, c);

    // (true || false) && true = true && true = true
    expect(andClause.evaluate({})).toBe(true);
    expect(andClause.toString()).toBe("((a || b) && c)");
  });

  it("should handle not within and", () => {
    const a = { evaluate: () => false, toString: () => "a" };
    const b = { evaluate: () => true, toString: () => "b" };

    const notClause = When.not(a);
    const andClause = When.and(notClause, b);

    // !false && true = true && true = true
    expect(andClause.evaluate({})).toBe(true);
    expect(andClause.toString()).toBe("(!a && b)");
  });

  it("should handle complex nested expression", () => {
    const a = { evaluate: () => true, toString: () => "a" };
    const b = { evaluate: () => false, toString: () => "b" };
    const c = { evaluate: () => true, toString: () => "c" };
    const d = { evaluate: () => true, toString: () => "d" };

    // ((a || b) && c) || !d
    const or1 = When.or(a, b);
    const and1 = When.and(or1, c);
    const not1 = When.not(d);
    const or2 = When.or(and1, not1);

    // ((true || false) && true) || !true
    // (true && true) || false
    // true || false
    // = true
    expect(or2.evaluate({})).toBe(true);
    expect(or2.toString()).toBe("(((a || b) && c) || !d)");
  });
});
