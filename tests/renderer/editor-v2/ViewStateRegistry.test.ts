import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ViewStateRegistry } from "../../../src/renderer/components/panes/editor-v2/registry/ViewStateRegistry";

// ============================================================================
// Mock Monaco Editor
// ============================================================================

const createMockViewState = (scrollTop = 0) => ({
  cursorState: [{ position: { lineNumber: 1, column: 1 } }],
  viewState: { scrollTop, scrollLeft: 0 },
  contributionsState: {},
});

const createMockEditor = () => {
  let savedState: unknown = null;

  return {
    saveViewState: vi.fn(() => savedState ?? createMockViewState()),
    restoreViewState: vi.fn((state: unknown) => {
      savedState = state;
    }),
  };
};

// ============================================================================
// Tests
// ============================================================================

describe("ViewStateRegistry", () => {
  beforeEach(() => {
    ViewStateRegistry.resetInstance();
  });

  afterEach(() => {
    ViewStateRegistry.resetInstance();
  });

  // ===========================================================================
  // Singleton Pattern
  // ===========================================================================

  describe("singleton", () => {
    it("should return the same instance on multiple calls", () => {
      const instance1 = ViewStateRegistry.getInstance();
      const instance2 = ViewStateRegistry.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("should create new instance after reset", () => {
      const instance1 = ViewStateRegistry.getInstance();
      ViewStateRegistry.resetInstance();
      const instance2 = ViewStateRegistry.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  // ===========================================================================
  // save
  // ===========================================================================

  describe("save", () => {
    it("should save ViewState from editor", () => {
      const registry = ViewStateRegistry.getInstance();
      const editor = createMockEditor() as any;

      registry.save("editor-1", "/test/file.ts", editor);

      expect(editor.saveViewState).toHaveBeenCalled();
      expect(registry.has("editor-1", "/test/file.ts")).toBe(true);
    });

    it("should overwrite existing ViewState", () => {
      const registry = ViewStateRegistry.getInstance();
      const editor1 = createMockEditor() as any;
      editor1.saveViewState.mockReturnValue(createMockViewState(100));

      const editor2 = createMockEditor() as any;
      editor2.saveViewState.mockReturnValue(createMockViewState(200));

      registry.save("editor-1", "/test/file.ts", editor1);
      registry.save("editor-1", "/test/file.ts", editor2);

      const state = registry.get("editor-1", "/test/file.ts");
      expect(state?.viewState?.scrollTop).toBe(200);
    });

    it("should not save if editor returns null ViewState", () => {
      const registry = ViewStateRegistry.getInstance();
      const editor = createMockEditor() as any;
      editor.saveViewState.mockReturnValue(null);

      registry.save("editor-1", "/test/file.ts", editor);

      expect(registry.has("editor-1", "/test/file.ts")).toBe(false);
    });
  });

  // ===========================================================================
  // restore
  // ===========================================================================

  describe("restore", () => {
    it("should restore ViewState to editor", () => {
      const registry = ViewStateRegistry.getInstance();
      const editor = createMockEditor() as any;
      const viewState = createMockViewState(150);
      editor.saveViewState.mockReturnValue(viewState);

      registry.save("editor-1", "/test/file.ts", editor);

      const newEditor = createMockEditor() as any;
      const result = registry.restore("editor-1", "/test/file.ts", newEditor);

      expect(result).toBe(true);
      expect(newEditor.restoreViewState).toHaveBeenCalledWith(viewState);
    });

    it("should return false if no ViewState saved", () => {
      const registry = ViewStateRegistry.getInstance();
      const editor = createMockEditor() as any;

      const result = registry.restore("editor-1", "/test/file.ts", editor);

      expect(result).toBe(false);
      expect(editor.restoreViewState).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // get
  // ===========================================================================

  describe("get", () => {
    it("should return saved ViewState", () => {
      const registry = ViewStateRegistry.getInstance();
      const editor = createMockEditor() as any;
      const viewState = createMockViewState(100);
      editor.saveViewState.mockReturnValue(viewState);

      registry.save("editor-1", "/test/file.ts", editor);

      expect(registry.get("editor-1", "/test/file.ts")).toEqual(viewState);
    });

    it("should return undefined for non-existent entry", () => {
      const registry = ViewStateRegistry.getInstance();

      expect(registry.get("editor-1", "/test/file.ts")).toBeUndefined();
    });
  });

  // ===========================================================================
  // has
  // ===========================================================================

  describe("has", () => {
    it("should return true for existing entry", () => {
      const registry = ViewStateRegistry.getInstance();
      const editor = createMockEditor() as any;

      registry.save("editor-1", "/test/file.ts", editor);

      expect(registry.has("editor-1", "/test/file.ts")).toBe(true);
    });

    it("should return false for non-existent entry", () => {
      const registry = ViewStateRegistry.getInstance();

      expect(registry.has("editor-1", "/test/file.ts")).toBe(false);
    });

    it("should distinguish between different editors", () => {
      const registry = ViewStateRegistry.getInstance();
      const editor = createMockEditor() as any;

      registry.save("editor-1", "/test/file.ts", editor);

      expect(registry.has("editor-1", "/test/file.ts")).toBe(true);
      expect(registry.has("editor-2", "/test/file.ts")).toBe(false);
    });

    it("should distinguish between different files", () => {
      const registry = ViewStateRegistry.getInstance();
      const editor = createMockEditor() as any;

      registry.save("editor-1", "/test/file1.ts", editor);

      expect(registry.has("editor-1", "/test/file1.ts")).toBe(true);
      expect(registry.has("editor-1", "/test/file2.ts")).toBe(false);
    });
  });

  // ===========================================================================
  // clear
  // ===========================================================================

  describe("clear", () => {
    it("should remove specific (editor, file) entry", () => {
      const registry = ViewStateRegistry.getInstance();
      const editor = createMockEditor() as any;

      registry.save("editor-1", "/test/file.ts", editor);
      expect(registry.has("editor-1", "/test/file.ts")).toBe(true);

      registry.clear("editor-1", "/test/file.ts");
      expect(registry.has("editor-1", "/test/file.ts")).toBe(false);
    });

    it("should not affect other entries", () => {
      const registry = ViewStateRegistry.getInstance();
      const editor = createMockEditor() as any;

      registry.save("editor-1", "/test/file1.ts", editor);
      registry.save("editor-1", "/test/file2.ts", editor);

      registry.clear("editor-1", "/test/file1.ts");

      expect(registry.has("editor-1", "/test/file1.ts")).toBe(false);
      expect(registry.has("editor-1", "/test/file2.ts")).toBe(true);
    });
  });

  // ===========================================================================
  // clearEditor
  // ===========================================================================

  describe("clearEditor", () => {
    it("should remove all entries for an editor", () => {
      const registry = ViewStateRegistry.getInstance();
      const editor = createMockEditor() as any;

      registry.save("editor-1", "/test/file1.ts", editor);
      registry.save("editor-1", "/test/file2.ts", editor);
      registry.save("editor-2", "/test/file1.ts", editor);

      registry.clearEditor("editor-1");

      expect(registry.has("editor-1", "/test/file1.ts")).toBe(false);
      expect(registry.has("editor-1", "/test/file2.ts")).toBe(false);
      expect(registry.has("editor-2", "/test/file1.ts")).toBe(true);
    });
  });

  // ===========================================================================
  // clearFile
  // ===========================================================================

  describe("clearFile", () => {
    it("should remove all entries for a file across all editors", () => {
      const registry = ViewStateRegistry.getInstance();
      const editor = createMockEditor() as any;

      registry.save("editor-1", "/test/file.ts", editor);
      registry.save("editor-2", "/test/file.ts", editor);
      registry.save("editor-1", "/test/other.ts", editor);

      registry.clearFile("/test/file.ts");

      expect(registry.has("editor-1", "/test/file.ts")).toBe(false);
      expect(registry.has("editor-2", "/test/file.ts")).toBe(false);
      expect(registry.has("editor-1", "/test/other.ts")).toBe(true);
    });
  });

  // ===========================================================================
  // stateCount
  // ===========================================================================

  describe("stateCount", () => {
    it("should start at zero", () => {
      const registry = ViewStateRegistry.getInstance();

      expect(registry.stateCount).toBe(0);
    });

    it("should increase when states are saved", () => {
      const registry = ViewStateRegistry.getInstance();
      const editor = createMockEditor() as any;

      registry.save("editor-1", "/test/file1.ts", editor);
      registry.save("editor-1", "/test/file2.ts", editor);

      expect(registry.stateCount).toBe(2);
    });

    it("should decrease when states are cleared", () => {
      const registry = ViewStateRegistry.getInstance();
      const editor = createMockEditor() as any;

      registry.save("editor-1", "/test/file1.ts", editor);
      registry.save("editor-1", "/test/file2.ts", editor);
      registry.clear("editor-1", "/test/file1.ts");

      expect(registry.stateCount).toBe(1);
    });
  });

  // ===========================================================================
  // clearAll
  // ===========================================================================

  describe("clearAll", () => {
    it("should remove all saved states", () => {
      const registry = ViewStateRegistry.getInstance();
      const editor = createMockEditor() as any;

      registry.save("editor-1", "/test/file1.ts", editor);
      registry.save("editor-2", "/test/file2.ts", editor);

      registry.clearAll();

      expect(registry.stateCount).toBe(0);
    });
  });

  // ===========================================================================
  // Per (Editor, File) Isolation
  // ===========================================================================

  // ===========================================================================
  // migrateFile
  // ===========================================================================

  describe("migrateFile", () => {
    it("should migrate ViewState from old path to new path for specified editors", () => {
      const registry = ViewStateRegistry.getInstance();
      const editor = createMockEditor() as any;
      editor.saveViewState.mockReturnValue(createMockViewState(500));

      // Save state for specific editors
      registry.save("editor-1", "/test/old.ts", editor);
      registry.save("editor-2", "/test/old.ts", editor);
      registry.save("editor-3", "/test/old.ts", editor);

      // Migrate only editor-1 and editor-2
      registry.migrateFile("/test/old.ts", "/test/new.ts", [
        "editor-1",
        "editor-2",
      ]);

      // Check migration happened for specified editors
      expect(registry.has("editor-1", "/test/new.ts")).toBe(true);
      expect(registry.has("editor-2", "/test/new.ts")).toBe(true);
      expect(registry.has("editor-1", "/test/old.ts")).toBe(false);
      expect(registry.has("editor-2", "/test/old.ts")).toBe(false);

      // editor-3 should still have old path
      expect(registry.has("editor-3", "/test/old.ts")).toBe(true);
      expect(registry.has("editor-3", "/test/new.ts")).toBe(false);
    });

    it("should migrate ViewState for all editors when no editorIds specified", () => {
      const registry = ViewStateRegistry.getInstance();
      const editor = createMockEditor() as any;
      editor.saveViewState.mockReturnValue(createMockViewState(500));

      // Save state for multiple editors
      registry.save("editor-1", "/test/old.ts", editor);
      registry.save("editor-2", "/test/old.ts", editor);
      registry.save("editor-1", "/test/other.ts", editor);

      // Migrate all editors
      registry.migrateFile("/test/old.ts", "/test/new.ts");

      // All editors should be migrated
      expect(registry.has("editor-1", "/test/new.ts")).toBe(true);
      expect(registry.has("editor-2", "/test/new.ts")).toBe(true);
      expect(registry.has("editor-1", "/test/old.ts")).toBe(false);
      expect(registry.has("editor-2", "/test/old.ts")).toBe(false);

      // Other file should be unaffected
      expect(registry.has("editor-1", "/test/other.ts")).toBe(true);
    });

    it("should preserve ViewState content during migration", () => {
      const registry = ViewStateRegistry.getInstance();
      const editor = createMockEditor() as any;
      editor.saveViewState.mockReturnValue(createMockViewState(999));

      registry.save("editor-1", "/test/old.ts", editor);
      registry.migrateFile("/test/old.ts", "/test/new.ts");

      const state = registry.get("editor-1", "/test/new.ts");
      expect(state?.viewState?.scrollTop).toBe(999);
    });

    it("should handle migration when no ViewState exists", () => {
      const registry = ViewStateRegistry.getInstance();

      // Should not throw
      expect(() => {
        registry.migrateFile("/test/nonexistent.ts", "/test/new.ts");
      }).not.toThrow();

      expect(registry.stateCount).toBe(0);
    });
  });

  describe("per (editor, file) isolation", () => {
    it("should store different ViewStates for same file in different editors", () => {
      const registry = ViewStateRegistry.getInstance();

      const editor1 = createMockEditor() as any;
      editor1.saveViewState.mockReturnValue(createMockViewState(100));

      const editor2 = createMockEditor() as any;
      editor2.saveViewState.mockReturnValue(createMockViewState(200));

      registry.save("editor-1", "/test/file.ts", editor1);
      registry.save("editor-2", "/test/file.ts", editor2);

      const state1 = registry.get("editor-1", "/test/file.ts");
      const state2 = registry.get("editor-2", "/test/file.ts");

      expect(state1?.viewState?.scrollTop).toBe(100);
      expect(state2?.viewState?.scrollTop).toBe(200);
    });

    it("should store different ViewStates for different files in same editor", () => {
      const registry = ViewStateRegistry.getInstance();

      const editor1 = createMockEditor() as any;
      editor1.saveViewState.mockReturnValueOnce(createMockViewState(100));
      editor1.saveViewState.mockReturnValueOnce(createMockViewState(200));

      registry.save("editor-1", "/test/file1.ts", editor1);
      registry.save("editor-1", "/test/file2.ts", editor1);

      const state1 = registry.get("editor-1", "/test/file1.ts");
      const state2 = registry.get("editor-1", "/test/file2.ts");

      expect(state1?.viewState?.scrollTop).toBe(100);
      expect(state2?.viewState?.scrollTop).toBe(200);
    });
  });
});
