import { describe, it, expect } from "vitest";
import { DerivedContextKey } from "@/commands/contextKeys/DerivedContextKey";
import { AggregateMode } from "@/commands/contextKeys/types";

describe("DerivedContextKey", () => {
  it("should construct with key, sourceKey, and aggregateMode", () => {
    const derived = new DerivedContextKey(
      "tabKey",
      "paneKey",
      AggregateMode.Any,
    );
    expect(derived.getKey()).toBe("tabKey");
    expect(derived.getSourceKey()).toBe("paneKey");
    expect(derived.getAggregateMode()).toBe(AggregateMode.Any);
  });

  it("should support all aggregate modes", () => {
    const anyDerived = new DerivedContextKey(
      "key1",
      "source",
      AggregateMode.Any,
    );
    const allDerived = new DerivedContextKey(
      "key2",
      "source",
      AggregateMode.All,
    );
    const countDerived = new DerivedContextKey(
      "key3",
      "source",
      AggregateMode.Count,
    );
    const firstDerived = new DerivedContextKey(
      "key4",
      "source",
      AggregateMode.First,
    );

    expect(anyDerived.getAggregateMode()).toBe(AggregateMode.Any);
    expect(allDerived.getAggregateMode()).toBe(AggregateMode.All);
    expect(countDerived.getAggregateMode()).toBe(AggregateMode.Count);
    expect(firstDerived.getAggregateMode()).toBe(AggregateMode.First);
  });
});
