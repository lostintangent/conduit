import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EditorModeRegistry } from "../../../src/renderer/components/panes/editor-v2/registry/EditorModeRegistry";
import type {
  EditorMode,
  EditorModeChangedEvent,
} from "../../../src/renderer/components/panes/editor-v2/types";

// ============================================================================
// Tests
// ============================================================================

describe("EditorModeRegistry", () => {
  beforeEach(() => {
    EditorModeRegistry.resetInstance();
    vi.clearAllMocks();
  });

  afterEach(() => {
    EditorModeRegistry.resetInstance();
  });

  // ===========================================================================
  // Singleton Pattern
  // ===========================================================================

  describe("singleton", () => {
    it("should return the same instance on multiple calls", () => {
      const instance1 = EditorModeRegistry.getInstance();
      const instance2 = EditorModeRegistry.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("should create new instance after reset", () => {
      const instance1 = EditorModeRegistry.getInstance();
      EditorModeRegistry.resetInstance();
      const instance2 = EditorModeRegistry.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  // ===========================================================================
  // getMode
  // ===========================================================================

  describe("getMode", () => {
    it("should return default editor mode for unknown file", () => {
      const registry = EditorModeRegistry.getInstance();

      const mode = registry.getMode("/test/unknown.ts");

      expect(mode).toEqual({ type: "editor" });
    });

    it("should return set mode for known file", () => {
      const registry = EditorModeRegistry.getInstance();
      const diffMode: EditorMode = { type: "diff", baseBranch: "main" };

      registry.setMode("/test/file.ts", diffMode);
      const mode = registry.getMode("/test/file.ts");

      expect(mode).toEqual(diffMode);
    });
  });

  // ===========================================================================
  // setMode
  // ===========================================================================

  describe("setMode", () => {
    it("should store mode for file", () => {
      const registry = EditorModeRegistry.getInstance();
      const diffMode: EditorMode = { type: "diff" };

      registry.setMode("/test/file.ts", diffMode);

      expect(registry.hasMode("/test/file.ts")).toBe(true);
      expect(registry.getMode("/test/file.ts")).toEqual(diffMode);
    });

    it("should fire event when mode changes", () => {
      const registry = EditorModeRegistry.getInstance();
      const events: EditorModeChangedEvent[] = [];

      registry.onModeChanged((event) => {
        events.push(event);
      });

      registry.setMode("/test/file.ts", { type: "diff" });

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        filePath: "/test/file.ts",
        oldMode: undefined,
        newMode: { type: "diff" },
      });
    });

    it("should not fire event when mode is same", () => {
      const registry = EditorModeRegistry.getInstance();

      registry.setMode("/test/file.ts", { type: "editor" });

      const events: EditorModeChangedEvent[] = [];
      registry.onModeChanged((event) => {
        events.push(event);
      });

      // Set same mode again
      registry.setMode("/test/file.ts", { type: "editor" });

      expect(events).toHaveLength(0);
    });

    it("should fire event when diff baseBranch changes", () => {
      const registry = EditorModeRegistry.getInstance();

      registry.setMode("/test/file.ts", { type: "diff", baseBranch: "main" });

      const events: EditorModeChangedEvent[] = [];
      registry.onModeChanged((event) => {
        events.push(event);
      });

      registry.setMode("/test/file.ts", {
        type: "diff",
        baseBranch: "develop",
      });

      expect(events).toHaveLength(1);
      expect(events[0].newMode).toEqual({
        type: "diff",
        baseBranch: "develop",
      });
    });

    it("should include old mode in event", () => {
      const registry = EditorModeRegistry.getInstance();

      registry.setMode("/test/file.ts", { type: "editor" });

      const events: EditorModeChangedEvent[] = [];
      registry.onModeChanged((event) => {
        events.push(event);
      });

      registry.setMode("/test/file.ts", { type: "diff" });

      expect(events[0].oldMode).toEqual({ type: "editor" });
    });
  });

  // ===========================================================================
  // clearMode
  // ===========================================================================

  describe("clearMode", () => {
    it("should remove mode for file", () => {
      const registry = EditorModeRegistry.getInstance();

      registry.setMode("/test/file.ts", { type: "diff" });
      expect(registry.hasMode("/test/file.ts")).toBe(true);

      registry.clearMode("/test/file.ts");
      expect(registry.hasMode("/test/file.ts")).toBe(false);
    });

    it("should revert to default mode after clear", () => {
      const registry = EditorModeRegistry.getInstance();

      registry.setMode("/test/file.ts", { type: "diff" });
      registry.clearMode("/test/file.ts");

      expect(registry.getMode("/test/file.ts")).toEqual({ type: "editor" });
    });

    it("should handle clearing non-existent file", () => {
      const registry = EditorModeRegistry.getInstance();

      // Should not throw
      expect(() => registry.clearMode("/test/unknown.ts")).not.toThrow();
    });
  });

  // ===========================================================================
  // hasMode
  // ===========================================================================

  describe("hasMode", () => {
    it("should return false for unknown file", () => {
      const registry = EditorModeRegistry.getInstance();

      expect(registry.hasMode("/test/unknown.ts")).toBe(false);
    });

    it("should return true for file with explicit mode", () => {
      const registry = EditorModeRegistry.getInstance();

      registry.setMode("/test/file.ts", { type: "editor" });

      expect(registry.hasMode("/test/file.ts")).toBe(true);
    });
  });

  // ===========================================================================
  // modeCount
  // ===========================================================================

  describe("modeCount", () => {
    it("should start at zero", () => {
      const registry = EditorModeRegistry.getInstance();

      expect(registry.modeCount).toBe(0);
    });

    it("should increase when modes are set", () => {
      const registry = EditorModeRegistry.getInstance();

      registry.setMode("/test/file1.ts", { type: "editor" });
      registry.setMode("/test/file2.ts", { type: "diff" });

      expect(registry.modeCount).toBe(2);
    });

    it("should decrease when modes are cleared", () => {
      const registry = EditorModeRegistry.getInstance();

      registry.setMode("/test/file1.ts", { type: "editor" });
      registry.setMode("/test/file2.ts", { type: "diff" });
      registry.clearMode("/test/file1.ts");

      expect(registry.modeCount).toBe(1);
    });
  });

  // ===========================================================================
  // getAllPaths
  // ===========================================================================

  describe("getAllPaths", () => {
    it("should return empty array when no modes set", () => {
      const registry = EditorModeRegistry.getInstance();

      expect(registry.getAllPaths()).toEqual([]);
    });

    it("should return all file paths with modes", () => {
      const registry = EditorModeRegistry.getInstance();

      registry.setMode("/test/file1.ts", { type: "editor" });
      registry.setMode("/test/file2.ts", { type: "diff" });

      const paths = registry.getAllPaths();
      expect(paths).toContain("/test/file1.ts");
      expect(paths).toContain("/test/file2.ts");
      expect(paths).toHaveLength(2);
    });
  });

  // ===========================================================================
  // clearAll
  // ===========================================================================

  describe("clearAll", () => {
    it("should remove all modes", () => {
      const registry = EditorModeRegistry.getInstance();

      registry.setMode("/test/file1.ts", { type: "editor" });
      registry.setMode("/test/file2.ts", { type: "diff" });

      registry.clearAll();

      expect(registry.modeCount).toBe(0);
      expect(registry.hasMode("/test/file1.ts")).toBe(false);
      expect(registry.hasMode("/test/file2.ts")).toBe(false);
    });
  });

  // ===========================================================================
  // Event Subscription
  // ===========================================================================

  describe("event subscription", () => {
    it("should allow unsubscribing", () => {
      const registry = EditorModeRegistry.getInstance();
      const events: EditorModeChangedEvent[] = [];

      const subscription = registry.onModeChanged((event) => {
        events.push(event);
      });

      registry.setMode("/test/file.ts", { type: "diff" });
      expect(events).toHaveLength(1);

      // Unsubscribe
      subscription.dispose();

      registry.setMode("/test/file.ts", { type: "editor" });
      // Should not receive new events
      expect(events).toHaveLength(1);
    });

    it("should support multiple subscribers", () => {
      const registry = EditorModeRegistry.getInstance();
      const events1: EditorModeChangedEvent[] = [];
      const events2: EditorModeChangedEvent[] = [];

      registry.onModeChanged((event) => events1.push(event));
      registry.onModeChanged((event) => events2.push(event));

      registry.setMode("/test/file.ts", { type: "diff" });

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
    });
  });

  // ===========================================================================
  // Same-File Same-Mode Policy
  // ===========================================================================

  describe("same-file same-mode policy", () => {
    it("should allow all editors to see mode changes via events", () => {
      const registry = EditorModeRegistry.getInstance();

      // Simulate editor 1 subscribing
      let editor1Mode: EditorMode | null = null;
      registry.onModeChanged((event) => {
        if (event.filePath === "/test/file.ts") {
          editor1Mode = event.newMode;
        }
      });

      // Simulate editor 2 subscribing
      let editor2Mode: EditorMode | null = null;
      registry.onModeChanged((event) => {
        if (event.filePath === "/test/file.ts") {
          editor2Mode = event.newMode;
        }
      });

      // Editor 2 changes mode to diff
      registry.setMode("/test/file.ts", { type: "diff" });

      // Both editors should see the change
      expect(editor1Mode).toEqual({ type: "diff" });
      expect(editor2Mode).toEqual({ type: "diff" });
    });
  });
});
