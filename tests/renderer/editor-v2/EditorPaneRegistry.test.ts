// @ts-nocheck
/**
 * @vitest-environment jsdom
 *
 * EditorPaneRegistry Tests
 *
 * Tests the global registry for EditorPaneV2 instances, including:
 * - Lifecycle management (create, attach, detach, dispose)
 * - Scroll persistence across DOM moves
 * - Visibility tracking and layout triggers
 * - Pending attachments when rootElement not ready
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EditorPaneRegistry } from "@/components/panes/editor-v2/registry/EditorPaneRegistry";

// ============================================================================
// Test Setup
// ============================================================================

describe("EditorPaneRegistry", () => {
  let registry: EditorPaneRegistry;

  beforeEach(() => {
    // Get fresh instance for each test
    EditorPaneRegistry.resetInstance();
    registry = EditorPaneRegistry.getInstance();
  });

  afterEach(() => {
    // Cleanup
    EditorPaneRegistry.resetInstance();
  });

  // ==========================================================================
  // Singleton Pattern
  // ==========================================================================

  describe("Singleton Pattern", () => {
    it("should return the same instance from getInstance()", () => {
      const instance1 = EditorPaneRegistry.getInstance();
      const instance2 = EditorPaneRegistry.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should create a new instance after resetInstance()", () => {
      const instance1 = EditorPaneRegistry.getInstance();
      EditorPaneRegistry.resetInstance();
      const instance2 = EditorPaneRegistry.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  // ==========================================================================
  // Lifecycle Management - Create
  // ==========================================================================

  describe("Lifecycle - Create", () => {
    it("should create a new pane entry with getOrCreate()", () => {
      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      const entry = registry.getOrCreate("pane-1", config);

      expect(entry).toBeDefined();
      expect(entry.paneId).toBe("pane-1");
      expect(entry.config).toBe(config);
      expect(entry.rootElement).toBeNull();
      expect(entry.currentContainer).toBeNull();
      expect(entry.isVisible).toBe(false);
    });

    it("should return existing entry on subsequent getOrCreate() calls", () => {
      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      const entry1 = registry.getOrCreate("pane-1", config);
      const entry2 = registry.getOrCreate("pane-1", config);

      expect(entry1).toBe(entry2);
    });

    it("should update config on subsequent getOrCreate() calls", () => {
      const config1 = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };
      const config2 = {
        pane: {
          id: "pane-1",
          type: "editor",
          cwd: "/test",
          filePath: "/test/file.ts",
        },
      };

      registry.getOrCreate("pane-1", config1);
      const entry = registry.getOrCreate("pane-1", config2);

      expect(entry.config).toBe(config2);
    });

    it("should fire paneAdded event when creating new pane", () => {
      const listener = vi.fn();
      registry.onEvent(listener);

      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);

      expect(listener).toHaveBeenCalledWith({
        type: "paneAdded",
        paneId: "pane-1",
        config,
      });
    });

    it("should fire paneUpdated event when config changes", () => {
      const listener = vi.fn();
      const config1 = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };
      const config2 = {
        pane: {
          id: "pane-1",
          type: "editor",
          cwd: "/test",
          filePath: "/test/file.ts",
        },
      };

      registry.getOrCreate("pane-1", config1);
      listener.mockClear(); // Clear the paneAdded event

      registry.onEvent(listener);
      registry.getOrCreate("pane-1", config2);

      expect(listener).toHaveBeenCalledWith({
        type: "paneUpdated",
        paneId: "pane-1",
        config: config2,
      });
    });
  });

  // ==========================================================================
  // Lifecycle Management - Attach/Detach
  // ==========================================================================

  describe("Lifecycle - Attach/Detach", () => {
    let mockContainer: HTMLElement;
    let mockRootElement: HTMLDivElement;

    beforeEach(() => {
      mockContainer = document.createElement("div");
      mockRootElement = document.createElement("div");
      document.body.appendChild(mockContainer);
    });

    afterEach(() => {
      document.body.innerHTML = "";
    });

    it("should store pendingContainer when rootElement not set", () => {
      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);
      registry.attach("pane-1", mockContainer);

      const entry = registry.get("pane-1");
      expect(entry.pendingContainer).toBe(mockContainer);
      expect(entry.currentContainer).toBeNull();
    });

    it("should complete pending attachment when rootElement is set", () => {
      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);
      registry.attach("pane-1", mockContainer);
      registry.setRootElement("pane-1", mockRootElement);

      const entry = registry.get("pane-1");
      expect(entry.pendingContainer).toBeNull();
      expect(entry.currentContainer).toBe(mockContainer);
      expect(mockContainer.contains(mockRootElement)).toBe(true);
    });

    it("should attach rootElement to container immediately if rootElement already set", () => {
      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);
      registry.setRootElement("pane-1", mockRootElement);
      registry.attach("pane-1", mockContainer);

      expect(mockContainer.contains(mockRootElement)).toBe(true);
    });

    it("should move rootElement to off-screen container on detach", () => {
      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);
      registry.setRootElement("pane-1", mockRootElement);
      registry.attach("pane-1", mockContainer);
      registry.detach("pane-1");

      expect(mockContainer.contains(mockRootElement)).toBe(false);
      // Should be in off-screen container
      const offscreenContainer = document.getElementById(
        "editor-pane-offscreen-container",
      );
      expect(offscreenContainer?.contains(mockRootElement)).toBe(true);
    });

    it("should fire paneAttached event on attach", () => {
      const listener = vi.fn();
      registry.onEvent(listener);

      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);
      registry.setRootElement("pane-1", mockRootElement);

      listener.mockClear();
      registry.attach("pane-1", mockContainer);

      expect(listener).toHaveBeenCalledWith({
        type: "paneAttached",
        paneId: "pane-1",
      });
    });

    it("should fire paneDetached event on detach", () => {
      const listener = vi.fn();
      registry.onEvent(listener);

      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);
      registry.setRootElement("pane-1", mockRootElement);
      registry.attach("pane-1", mockContainer);

      listener.mockClear();
      registry.detach("pane-1");

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ type: "paneDetached", paneId: "pane-1" }),
      );
    });
  });

  // ==========================================================================
  // Lifecycle Management - Dispose
  // ==========================================================================

  describe("Lifecycle - Dispose", () => {
    it("should remove pane from registry on dispose()", () => {
      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);
      expect(registry.has("pane-1")).toBe(true);

      registry.dispose("pane-1");
      expect(registry.has("pane-1")).toBe(false);
    });

    it("should remove rootElement from DOM on dispose()", () => {
      const mockRootElement = document.createElement("div");
      const mockContainer = document.createElement("div");
      document.body.appendChild(mockContainer);

      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);
      registry.setRootElement("pane-1", mockRootElement);
      registry.attach("pane-1", mockContainer);

      expect(mockContainer.contains(mockRootElement)).toBe(true);

      registry.dispose("pane-1");
      expect(mockContainer.contains(mockRootElement)).toBe(false);
      expect(document.body.contains(mockRootElement)).toBe(false);
    });

    it("should fire paneRemoved event on dispose()", () => {
      const listener = vi.fn();
      registry.onEvent(listener);

      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);
      listener.mockClear();

      registry.dispose("pane-1");

      expect(listener).toHaveBeenCalledWith({
        type: "paneRemoved",
        paneId: "pane-1",
      });
    });
  });

  // ==========================================================================
  // Scroll Persistence
  // ==========================================================================

  describe("Scroll Persistence", () => {
    let mockScrollElement: HTMLElement;
    let mockContainer: HTMLElement;
    let mockRootElement: HTMLDivElement;

    beforeEach(() => {
      mockScrollElement = document.createElement("div");
      mockContainer = document.createElement("div");
      mockRootElement = document.createElement("div");

      // Make scroll element scrollable
      mockScrollElement.style.overflow = "auto";
      mockScrollElement.style.height = "100px";
      mockScrollElement.innerHTML = '<div style="height: 1000px"></div>';

      document.body.appendChild(mockContainer);
      mockContainer.appendChild(mockScrollElement);
    });

    afterEach(() => {
      document.body.innerHTML = "";
    });

    it("should register scroll container", () => {
      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);
      registry.registerScrollContainer(
        "pane-1",
        "testScroll",
        mockScrollElement,
      );

      const entry = registry.get("pane-1");
      expect(entry.scrollContainers.has("testScroll")).toBe(true);
    });

    it("should update scroll position when updateScrollPosition() is called", () => {
      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);
      registry.registerScrollContainer(
        "pane-1",
        "testScroll",
        mockScrollElement,
      );
      registry.updateScrollPosition("pane-1", "testScroll", 250);

      const entry = registry.get("pane-1");
      const scrollEntry = entry.scrollContainers.get("testScroll");
      expect(scrollEntry.savedScrollTop).toBe(250);
    });

    it("should preserve scroll position during detach/attach cycle", async () => {
      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);
      registry.setRootElement("pane-1", mockRootElement);
      registry.attach("pane-1", mockContainer);
      registry.registerScrollContainer(
        "pane-1",
        "testScroll",
        mockScrollElement,
      );

      // Simulate scroll
      mockScrollElement.scrollTop = 250;
      registry.updateScrollPosition("pane-1", "testScroll", 250);

      // Detach (simulates tab switch away)
      registry.detach("pane-1");

      // Create new container
      const newContainer = document.createElement("div");
      document.body.appendChild(newContainer);

      // Re-attach (simulates tab switch back)
      registry.attach("pane-1", newContainer);

      // Wait for requestAnimationFrame in restoreScrollPositions
      await new Promise((resolve) => requestAnimationFrame(resolve));

      // Scroll position should be restored
      expect(mockScrollElement.scrollTop).toBe(250);
    });

    it("should handle element hidden before detach (critical bug fix test)", () => {
      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);
      registry.setRootElement("pane-1", mockRootElement);
      registry.attach("pane-1", mockContainer);
      registry.registerScrollContainer(
        "pane-1",
        "testScroll",
        mockScrollElement,
      );

      // Simulate scroll event updating position
      mockScrollElement.scrollTop = 250;
      registry.updateScrollPosition("pane-1", "testScroll", 250);

      // Simulate element being hidden (dimensions become 0)
      mockScrollElement.style.display = "none";

      // Detach (this would previously read scrollTop=0 because element is hidden)
      registry.detach("pane-1");

      const entry = registry.get("pane-1");
      const scrollEntry = entry.scrollContainers.get("testScroll");

      // Should preserve the scroll position from updateScrollPosition, not 0
      expect(scrollEntry.savedScrollTop).toBe(250);
    });

    it("should unregister scroll container and preserve savedScrollTop", () => {
      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);
      registry.registerScrollContainer(
        "pane-1",
        "testScroll",
        mockScrollElement,
      );
      mockScrollElement.scrollTop = 250;
      registry.updateScrollPosition("pane-1", "testScroll", 250);

      registry.unregisterScrollContainer("pane-1", "testScroll");

      const entry = registry.get("pane-1");
      const scrollEntry = entry.scrollContainers.get("testScroll");

      // Entry should still exist with saved position
      expect(scrollEntry).toBeDefined();
      expect(scrollEntry.savedScrollTop).toBe(250);
      expect(scrollEntry.element).toBeNull();
    });
  });

  // ==========================================================================
  // Visibility Tracking
  // ==========================================================================

  describe("Visibility Tracking", () => {
    it("should mark pane as visible when notifyVisible() is called", () => {
      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);
      expect(registry.isVisible("pane-1")).toBe(false);

      registry.notifyVisible("pane-1");
      expect(registry.isVisible("pane-1")).toBe(true);
    });

    it("should mark pane as hidden when notifyHidden() is called", () => {
      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);
      registry.notifyVisible("pane-1");
      expect(registry.isVisible("pane-1")).toBe(true);

      registry.notifyHidden("pane-1");
      expect(registry.isVisible("pane-1")).toBe(false);
    });

    it("should fire visibilityChanged event when visibility changes", () => {
      const listener = vi.fn();
      registry.onEvent(listener);

      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);
      listener.mockClear();

      registry.notifyVisible("pane-1");

      expect(listener).toHaveBeenCalledWith({
        type: "visibilityChanged",
        paneId: "pane-1",
        isVisible: true,
      });
    });

    it("should trigger layout callback when notifyVisible() is called", () => {
      const layoutTrigger = vi.fn();
      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);
      registry.setLayoutTrigger("pane-1", layoutTrigger);

      registry.notifyVisible("pane-1");

      expect(layoutTrigger).toHaveBeenCalled();
    });

    it("should not fire visibilityChanged event if visibility unchanged", () => {
      const listener = vi.fn();
      registry.onEvent(listener);

      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);
      registry.notifyVisible("pane-1");

      listener.mockClear();
      registry.notifyVisible("pane-1"); // Call again

      expect(listener).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "visibilityChanged" }),
      );
    });
  });

  // ==========================================================================
  // Query Methods
  // ==========================================================================

  describe("Query Methods", () => {
    it("should return true from has() for existing pane", () => {
      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);
      expect(registry.has("pane-1")).toBe(true);
    });

    it("should return false from has() for non-existent pane", () => {
      expect(registry.has("non-existent")).toBe(false);
    });

    it("should return pane entry from get()", () => {
      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      const entry = registry.getOrCreate("pane-1", config);
      expect(registry.get("pane-1")).toBe(entry);
    });

    it("should return undefined from get() for non-existent pane", () => {
      expect(registry.get("non-existent")).toBeUndefined();
    });

    it("should return all pane entries from getAll()", () => {
      const config1 = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };
      const config2 = {
        pane: { id: "pane-2", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config1);
      registry.getOrCreate("pane-2", config2);

      const entries = registry.getAll();
      expect(entries).toHaveLength(2);
      expect(entries.some((e) => e.paneId === "pane-1")).toBe(true);
      expect(entries.some((e) => e.paneId === "pane-2")).toBe(true);
    });

    it("should return all pane IDs from getAllIds()", () => {
      const config1 = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };
      const config2 = {
        pane: { id: "pane-2", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config1);
      registry.getOrCreate("pane-2", config2);

      const ids = registry.getAllIds();
      expect(ids).toContain("pane-1");
      expect(ids).toContain("pane-2");
    });
  });

  // ==========================================================================
  // Update Config
  // ==========================================================================

  describe("Update Config", () => {
    it("should update pane config with updateConfig()", () => {
      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);

      const newPaneConfig = {
        pane: {
          id: "pane-1",
          type: "editor",
          cwd: "/test",
          filePath: "/test/file.ts",
        },
      };

      registry.updateConfig("pane-1", newPaneConfig);

      const entry = registry.get("pane-1");
      expect(entry.config.pane.filePath).toBe("/test/file.ts");
    });

    it("should fire paneUpdated event when updateConfig() is called", () => {
      const listener = vi.fn();
      registry.onEvent(listener);

      const config = {
        pane: { id: "pane-1", type: "editor", cwd: "/test", filePath: null },
      };

      registry.getOrCreate("pane-1", config);
      listener.mockClear();

      const newPaneConfig = {
        pane: {
          id: "pane-1",
          type: "editor",
          cwd: "/test",
          filePath: "/test/file.ts",
        },
      };

      registry.updateConfig("pane-1", newPaneConfig);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "paneUpdated",
          paneId: "pane-1",
        }),
      );
    });
  });
});
