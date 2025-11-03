import { describe, it, expect } from "vitest";
import { ContextLevel, AggregateMode } from "@/commands/contextKeys/types";

describe("ContextLevel enum", () => {
  it("should have Pane level", () => {
    expect(ContextLevel.Pane).toBe("pane");
  });

  it("should have Tab level", () => {
    expect(ContextLevel.Tab).toBe("tab");
  });

  it("should have Global level", () => {
    expect(ContextLevel.Global).toBe("global");
  });
});

describe("AggregateMode enum", () => {
  it("should have Any mode", () => {
    expect(AggregateMode.Any).toBe("any");
  });

  it("should have All mode", () => {
    expect(AggregateMode.All).toBe("all");
  });

  it("should have Count mode", () => {
    expect(AggregateMode.Count).toBe("count");
  });

  it("should have First mode", () => {
    expect(AggregateMode.First).toBe("first");
  });
});
