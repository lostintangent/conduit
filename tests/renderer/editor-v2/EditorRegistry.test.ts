import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as monaco from "monaco-editor";
import { EditorRegistry } from "../../../src/renderer/components/panes/editor-v2/registry/EditorRegistry";

// Access the mock helpers
const monacoMock = monaco as unknown as {
  editor: {
    create: ReturnType<typeof vi.fn>;
  };
  __testHelpers: {
    createMockEditor: () => ReturnType<typeof vi.fn>;
  };
};

// ============================================================================
// Tests
// ============================================================================

describe("EditorRegistry", () => {
  beforeEach(() => {
    // Reset singleton before each test
    EditorRegistry.resetInstance();
    vi.clearAllMocks();

    // Reset the mock to create fresh editor instances
    monacoMock.editor.create.mockImplementation(() =>
      monacoMock.__testHelpers.createMockEditor(),
    );
  });

  afterEach(() => {
    EditorRegistry.resetInstance();
  });

  // ===========================================================================
  // Singleton Pattern
  // ===========================================================================

  describe("singleton", () => {
    it("should return the same instance on multiple calls", () => {
      const instance1 = EditorRegistry.getInstance();
      const instance2 = EditorRegistry.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("should create new instance after reset", () => {
      const instance1 = EditorRegistry.getInstance();
      EditorRegistry.resetInstance();
      const instance2 = EditorRegistry.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  // ===========================================================================
  // getOrCreateEditor
  // ===========================================================================

  describe("getOrCreateEditor", () => {
    it("should create a new editor when none exists", () => {
      const registry = EditorRegistry.getInstance();
      const container = document.createElement("div");

      const editor = registry.getOrCreateEditor("test-editor-1", container);

      expect(editor).toBeDefined();
      expect(registry.editorCount).toBe(1);
      expect(registry.hasEditor("test-editor-1")).toBe(true);
    });

    it("should return existing editor when called with same ID", () => {
      const registry = EditorRegistry.getInstance();
      const container1 = document.createElement("div");
      const container2 = document.createElement("div");

      const editor1 = registry.getOrCreateEditor("test-editor-1", container1);
      const editor2 = registry.getOrCreateEditor("test-editor-1", container2);

      expect(editor1).toBe(editor2);
      expect(registry.editorCount).toBe(1);
    });

    it("should create separate editors for different IDs", () => {
      const registry = EditorRegistry.getInstance();
      const container1 = document.createElement("div");
      const container2 = document.createElement("div");

      const editor1 = registry.getOrCreateEditor("editor-1", container1);
      const editor2 = registry.getOrCreateEditor("editor-2", container2);

      expect(editor1).not.toBe(editor2);
      expect(registry.editorCount).toBe(2);
    });

    it("should update lastUsed timestamp when reusing editor", () => {
      const registry = EditorRegistry.getInstance();
      const container = document.createElement("div");

      registry.getOrCreateEditor("test-editor", container);
      const meta1 = registry.getMetadata("test-editor");
      const firstLastUsed = meta1?.lastUsed;

      registry.getOrCreateEditor("test-editor", container);
      const meta2 = registry.getMetadata("test-editor");

      expect(meta2?.lastUsed).toBeGreaterThanOrEqual(firstLastUsed!);
    });
  });

  // ===========================================================================
  // Portal Pattern (Container Move)
  // ===========================================================================

  describe("portal pattern", () => {
    it("should move editor to new container", () => {
      const registry = EditorRegistry.getInstance();
      const container1 = document.createElement("div");
      const container2 = document.createElement("div");

      const editor = registry.getOrCreateEditor("test-editor", container1);

      // Get editor again with different container
      registry.getOrCreateEditor("test-editor", container2);

      // Should have called layout after move
      expect(editor.layout).toHaveBeenCalled();
    });

    it("should preserve ViewState when moving containers", () => {
      const registry = EditorRegistry.getInstance();
      const container1 = document.createElement("div");
      const container2 = document.createElement("div");

      const editor = registry.getOrCreateEditor("test-editor", container1);

      // Move to new container
      registry.getOrCreateEditor("test-editor", container2);

      // Should have saved and restored ViewState
      expect(editor.saveViewState).toHaveBeenCalled();
      expect(editor.restoreViewState).toHaveBeenCalled();
    });

    it("should not move if container is the same", () => {
      const registry = EditorRegistry.getInstance();
      const container = document.createElement("div");

      const editor = registry.getOrCreateEditor("test-editor", container);
      vi.clearAllMocks();

      // Call again with same container
      registry.getOrCreateEditor("test-editor", container);

      // Should not have triggered a move
      expect(editor.saveViewState).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // releaseEditor
  // ===========================================================================

  describe("releaseEditor", () => {
    it("should update lastUsed timestamp", () => {
      const registry = EditorRegistry.getInstance();
      const container = document.createElement("div");

      registry.getOrCreateEditor("test-editor", container);
      const meta1 = registry.getMetadata("test-editor");
      const firstLastUsed = meta1?.lastUsed;

      registry.releaseEditor("test-editor");
      const meta2 = registry.getMetadata("test-editor");

      expect(meta2?.lastUsed).toBeGreaterThanOrEqual(firstLastUsed!);
    });

    it("should not dispose the editor (kept for reuse)", () => {
      const registry = EditorRegistry.getInstance();
      const container = document.createElement("div");

      const editor = registry.getOrCreateEditor("test-editor", container);
      registry.releaseEditor("test-editor");

      // Editor should still exist
      expect(registry.hasEditor("test-editor")).toBe(true);
      expect(editor.dispose).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // disposeEditor
  // ===========================================================================

  describe("disposeEditor", () => {
    it("should dispose editor and remove from registry", () => {
      const registry = EditorRegistry.getInstance();
      const container = document.createElement("div");

      const editor = registry.getOrCreateEditor("test-editor", container);
      registry.disposeEditor("test-editor");

      expect(editor.dispose).toHaveBeenCalled();
      expect(registry.hasEditor("test-editor")).toBe(false);
      expect(registry.editorCount).toBe(0);
    });

    it("should handle non-existent editor gracefully", () => {
      const registry = EditorRegistry.getInstance();

      // Should not throw
      expect(() => registry.disposeEditor("non-existent")).not.toThrow();
    });
  });

  // ===========================================================================
  // LRU Eviction
  // ===========================================================================

  describe("LRU eviction", () => {
    it("should evict oldest editors when exceeding max", () => {
      const registry = EditorRegistry.getInstance();
      registry.setMaxEditors(2);
      // Must also set maxPinnedEditors low enough to allow eviction
      // (editors start pinned, and pinned editors can't be evicted)
      registry.setMaxPinnedEditors(1);

      const container1 = document.createElement("div");
      const container2 = document.createElement("div");
      const container3 = document.createElement("div");

      // Create 3 editors when max is 2
      const editor1 = registry.getOrCreateEditor("editor-1", container1);
      registry.getOrCreateEditor("editor-2", container2);
      registry.getOrCreateEditor("editor-3", container3);

      // editor-1 should have been evicted (oldest)
      expect(registry.editorCount).toBe(2);
      expect(registry.hasEditor("editor-1")).toBe(false);
      expect(editor1.dispose).toHaveBeenCalled();
    });

    it("should keep most recently used editors", () => {
      vi.useFakeTimers();
      const registry = EditorRegistry.getInstance();
      registry.setMaxEditors(2);
      // Must also set maxPinnedEditors low enough to allow eviction
      registry.setMaxPinnedEditors(1);

      const container1 = document.createElement("div");
      const container2 = document.createElement("div");
      const container3 = document.createElement("div");

      // Create editor-1 at t=0
      registry.getOrCreateEditor("editor-1", container1);

      // Create editor-2 at t=100
      vi.advanceTimersByTime(100);
      registry.getOrCreateEditor("editor-2", container2);

      // Touch editor-1 at t=200 to make it more recent than editor-2
      vi.advanceTimersByTime(100);
      registry.getOrCreateEditor("editor-1", container1);

      // Now create editor-3 at t=300, should evict editor-2 (least recent)
      vi.advanceTimersByTime(100);
      registry.getOrCreateEditor("editor-3", container3);

      expect(registry.hasEditor("editor-1")).toBe(true);
      expect(registry.hasEditor("editor-2")).toBe(false);
      expect(registry.hasEditor("editor-3")).toBe(true);

      vi.useRealTimers();
    });
  });

  // ===========================================================================
  // getEditor
  // ===========================================================================

  describe("getEditor", () => {
    it("should return editor if exists", () => {
      const registry = EditorRegistry.getInstance();
      const container = document.createElement("div");

      const created = registry.getOrCreateEditor("test-editor", container);
      const retrieved = registry.getEditor("test-editor");

      expect(retrieved).toBe(created);
    });

    it("should return undefined if not exists", () => {
      const registry = EditorRegistry.getInstance();

      expect(registry.getEditor("non-existent")).toBeUndefined();
    });
  });

  // ===========================================================================
  // disposeAll
  // ===========================================================================

  describe("disposeAll", () => {
    it("should dispose all editors", () => {
      const registry = EditorRegistry.getInstance();
      const container1 = document.createElement("div");
      const container2 = document.createElement("div");

      const editor1 = registry.getOrCreateEditor("editor-1", container1);
      const editor2 = registry.getOrCreateEditor("editor-2", container2);

      registry.disposeAll();

      expect(editor1.dispose).toHaveBeenCalled();
      expect(editor2.dispose).toHaveBeenCalled();
      expect(registry.editorCount).toBe(0);
    });
  });

  // ===========================================================================
  // Metadata
  // ===========================================================================

  describe("metadata", () => {
    it("should track createdAt timestamp", () => {
      const registry = EditorRegistry.getInstance();
      const container = document.createElement("div");
      const before = Date.now();

      registry.getOrCreateEditor("test-editor", container);

      const meta = registry.getMetadata("test-editor");
      expect(meta?.createdAt).toBeGreaterThanOrEqual(before);
    });

    it("should return undefined for non-existent editor", () => {
      const registry = EditorRegistry.getInstance();

      expect(registry.getMetadata("non-existent")).toBeUndefined();
    });
  });
});
