import { describe, it, expect } from "vitest";
import { ContextKey } from "@/commands/contextKeys/ContextKey";
import { When } from "@/commands/whenClauses/When";

describe("ContextKey when clause methods", () => {
  describe("isTrue()", () => {
    it("should only match true", () => {
      const key = new ContextKey("testKey", false);
      const whenClause = key.isTrue();

      expect(whenClause.evaluate({ testKey: true })).toBe(true);
      expect(whenClause.evaluate({ testKey: false })).toBe(false);
      expect(whenClause.evaluate({ testKey: 1 })).toBe(false);
      expect(whenClause.evaluate({ testKey: "true" })).toBe(false);
    });

    it("should format toString correctly", () => {
      const key = new ContextKey("myKey", false);
      const whenClause = key.isTrue();

      expect(whenClause.toString()).toBe("myKey");
    });
  });

  describe("isFalse()", () => {
    it("should only match false", () => {
      const key = new ContextKey("testKey", true);
      const whenClause = key.isFalse();

      expect(whenClause.evaluate({ testKey: false })).toBe(true);
      expect(whenClause.evaluate({ testKey: true })).toBe(false);
      expect(whenClause.evaluate({ testKey: 0 })).toBe(false);
      expect(whenClause.evaluate({ testKey: "" })).toBe(false);
    });

    it("should format toString correctly", () => {
      const key = new ContextKey("myKey", false);
      const whenClause = key.isFalse();

      expect(whenClause.toString()).toBe("!myKey");
    });
  });

  describe("equals()", () => {
    it("should match exact value", () => {
      const key = new ContextKey("testKey", "default");
      const whenClause = key.equals("target");

      expect(whenClause.evaluate({ testKey: "target" })).toBe(true);
      expect(whenClause.evaluate({ testKey: "other" })).toBe(false);
      expect(whenClause.evaluate({})).toBe(false);
    });

    it("should work with numbers", () => {
      const key = new ContextKey("count", 0);
      const whenClause = key.equals(42);

      expect(whenClause.evaluate({ count: 42 })).toBe(true);
      expect(whenClause.evaluate({ count: 0 })).toBe(false);
    });

    it("should format toString correctly", () => {
      const key = new ContextKey("myKey", "default");
      const whenClause = key.equals("value");

      expect(whenClause.toString()).toBe('myKey == "value"');
    });
  });

  describe("greaterThan()", () => {
    it("should compare numbers", () => {
      const key = new ContextKey("count", 0);
      const whenClause = key.greaterThan(10);

      expect(whenClause.evaluate({ count: 15 })).toBe(true);
      expect(whenClause.evaluate({ count: 10 })).toBe(false);
      expect(whenClause.evaluate({ count: 5 })).toBe(false);
    });

    it("should format toString correctly", () => {
      const key = new ContextKey("count", 0);
      const whenClause = key.greaterThan(10);

      expect(whenClause.toString()).toBe("count > 10");
    });
  });

  describe("complex when clause combinations", () => {
    it("should work with When.and()", () => {
      const key1 = new ContextKey("key1", false);
      const key2 = new ContextKey("key2", false);

      const combined = When.and(key1.isTrue(), key2.isTrue());

      expect(combined.evaluate({ key1: true, key2: true })).toBe(true);
      expect(combined.evaluate({ key1: true, key2: false })).toBe(false);
      expect(combined.toString()).toBe("(key1 && key2)");
    });

    it("should work with When.or()", () => {
      const key1 = new ContextKey("key1", false);
      const key2 = new ContextKey("key2", false);

      const combined = When.or(key1.isTrue(), key2.isTrue());

      expect(combined.evaluate({ key1: true, key2: false })).toBe(true);
      expect(combined.evaluate({ key1: false, key2: false })).toBe(false);
      expect(combined.toString()).toBe("(key1 || key2)");
    });

    it("should create complex nested expressions", () => {
      const focus = new ContextKey("focus", false);
      const count = new ContextKey("count", 0);
      const mode = new ContextKey("mode", "");

      // focus && count > 0 && mode == "edit"
      const complex = When.and(
        focus.isTrue(),
        count.greaterThan(0),
        mode.equals("edit"),
      );

      expect(complex.evaluate({ focus: true, count: 5, mode: "edit" })).toBe(
        true,
      );
      expect(complex.evaluate({ focus: false, count: 5, mode: "edit" })).toBe(
        false,
      );
      expect(complex.evaluate({ focus: true, count: 0, mode: "edit" })).toBe(
        false,
      );
      expect(complex.evaluate({ focus: true, count: 5, mode: "view" })).toBe(
        false,
      );
    });
  });
});
