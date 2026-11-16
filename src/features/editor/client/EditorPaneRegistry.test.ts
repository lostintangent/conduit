/**
 * EditorPaneRegistry Tests
 *
 * Tests the global registry for EditorPane instances, including:
 * - Lifecycle management (create, attach, detach, dispose)
 * - Scroll persistence across DOM moves
 * - Pending attachments when rootElement not ready
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  EditorPaneRegistry,
  type EditorPaneConfig,
} from "@features/editor/client/EditorPaneRegistry";

/** A config for an editor pane on /test, showing `file` if given. */
const config = (paneId = "pane-1", file?: string): EditorPaneConfig => ({
  pane: { id: paneId, type: "editor", cwd: "/test", file },
});

/** Wait for the registry's requestAnimationFrame callbacks. */
const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(resolve));

describe("EditorPaneRegistry", () => {
  let registry: EditorPaneRegistry;

  beforeEach(() => {
    EditorPaneRegistry.resetInstance();
    registry = EditorPaneRegistry.getInstance();
  });

  afterEach(() => {
    EditorPaneRegistry.resetInstance();
    document.body.innerHTML = "";
  });

  /** Create pane-1, mark it ready, and attach it to `container`. */
  function attached(container: HTMLElement) {
    const entry = registry.getOrCreate("pane-1", config());
    registry.markReady("pane-1");
    registry.attach("pane-1", container);
    return entry;
  }

  /** Listen to the registry's events, starting after pane-1 is created. */
  function listenAfterCreate() {
    registry.getOrCreate("pane-1", config());
    const listener = vi.fn();
    registry.onEvent(listener);
    return listener;
  }

  describe("Singleton Pattern", () => {
    it("should return the same instance from getInstance()", () => {
      expect(EditorPaneRegistry.getInstance()).toBe(
        EditorPaneRegistry.getInstance(),
      );
    });

    it("should create a new instance after resetInstance()", () => {
      const instance1 = EditorPaneRegistry.getInstance();
      EditorPaneRegistry.resetInstance();
      expect(EditorPaneRegistry.getInstance()).not.toBe(instance1);
    });
  });

  describe("Lifecycle - Create", () => {
    it("should create a new pane entry with getOrCreate()", () => {
      const paneConfig = config();

      const entry = registry.getOrCreate("pane-1", paneConfig);

      expect(entry.paneId).toBe("pane-1");
      expect(entry.config).toBe(paneConfig);
      expect(entry.wrapperElement).toBeDefined();
      expect(entry.currentContainer).toBeNull();
    });

    it("should return existing entry on subsequent getOrCreate() calls", () => {
      const entry1 = registry.getOrCreate("pane-1", config());
      const entry2 = registry.getOrCreate("pane-1", config());

      expect(entry1).toBe(entry2);
    });

    it("should update config on subsequent getOrCreate() calls", () => {
      const config2 = config("pane-1", "/test/file.ts");

      registry.getOrCreate("pane-1", config());
      const entry = registry.getOrCreate("pane-1", config2);

      expect(entry.config).toBe(config2);
    });

    it("should fire paneAdded event when creating new pane", () => {
      const listener = vi.fn();
      registry.onEvent(listener);
      const paneConfig = config();

      registry.getOrCreate("pane-1", paneConfig);

      expect(listener).toHaveBeenCalledWith({
        type: "paneAdded",
        paneId: "pane-1",
        config: paneConfig,
      });
    });

    it("should fire paneUpdated event when config changes", () => {
      const listener = listenAfterCreate();
      const config2 = config("pane-1", "/test/file.ts");

      registry.getOrCreate("pane-1", config2);

      expect(listener).toHaveBeenCalledWith({
        type: "paneUpdated",
        paneId: "pane-1",
        config: config2,
      });
    });
  });

  describe("Lifecycle - Attach/Detach", () => {
    let mockContainer: HTMLElement;

    beforeEach(() => {
      mockContainer = document.createElement("div");
      document.body.appendChild(mockContainer);
    });

    it("should store pendingContainer when rootElement not set", () => {
      const entry = registry.getOrCreate("pane-1", config());

      registry.attach("pane-1", mockContainer);

      expect(entry.pendingContainer).toBe(mockContainer);
      expect(entry.currentContainer).toBeNull();
    });

    it("should complete pending attachment when rootElement is set", () => {
      const entry = registry.getOrCreate("pane-1", config());

      registry.attach("pane-1", mockContainer);
      registry.markReady("pane-1");

      expect(entry.pendingContainer).toBeNull();
      expect(entry.currentContainer).toBe(mockContainer);
      expect(mockContainer.contains(entry.wrapperElement)).toBe(true);
    });

    it("should attach rootElement to container immediately if rootElement already set", () => {
      const entry = attached(mockContainer);

      expect(mockContainer.contains(entry.wrapperElement)).toBe(true);
    });

    it("should move rootElement to off-screen container on detach", () => {
      const entry = attached(mockContainer);

      registry.detach("pane-1");

      expect(mockContainer.contains(entry.wrapperElement)).toBe(false);
      const offscreenContainer = document.getElementById(
        "editor-pane-offscreen-container",
      );
      expect(offscreenContainer?.contains(entry.wrapperElement)).toBe(true);
    });

    it("keeps a detached pane at the size it was shown at", () => {
      let resized: (target: Element, width: number, height: number) => void;
      vi.stubGlobal(
        "ResizeObserver",
        class {
          constructor(callback: ResizeObserverCallback) {
            resized = (target, width, height) =>
              callback(
                [{ target, contentRect: { width, height } }] as never,
                this as unknown as ResizeObserver,
              );
          }
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      );
      try {
        const { wrapperElement } = attached(mockContainer);
        const size = () => [
          wrapperElement.style.width,
          wrapperElement.style.height,
        ];
        resized!(wrapperElement, 800, 600);
        // A hidden tab's content measures 0x0 before its panes detach
        resized!(wrapperElement, 0, 0);

        registry.detach("pane-1");
        expect(size()).toEqual(["800px", "600px"]);

        registry.attach("pane-1", mockContainer);
        expect(size()).toEqual(["100%", "100%"]);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe("Lifecycle - Dispose", () => {
    it("should remove pane from registry on dispose()", () => {
      registry.getOrCreate("pane-1", config());
      expect(registry.has("pane-1")).toBe(true);

      registry.dispose("pane-1");
      expect(registry.has("pane-1")).toBe(false);
    });

    it("should remove rootElement from DOM on dispose()", () => {
      const mockContainer = document.createElement("div");
      document.body.appendChild(mockContainer);
      const entry = attached(mockContainer);
      expect(mockContainer.contains(entry.wrapperElement)).toBe(true);

      registry.dispose("pane-1");

      expect(document.body.contains(entry.wrapperElement)).toBe(false);
    });

    it("should fire paneRemoved event on dispose()", () => {
      const listener = listenAfterCreate();

      registry.dispose("pane-1");

      expect(listener).toHaveBeenCalledWith({
        type: "paneRemoved",
        paneId: "pane-1",
      });
    });
  });

  describe("Scroll Persistence", () => {
    let mockScrollElement: HTMLElement;
    let mockContainer: HTMLElement;

    beforeEach(() => {
      mockScrollElement = document.createElement("div");
      mockContainer = document.createElement("div");

      // Make scroll element scrollable
      mockScrollElement.style.overflow = "auto";
      mockScrollElement.style.height = "100px";
      mockScrollElement.innerHTML = '<div style="height: 1000px"></div>';

      document.body.appendChild(mockContainer);
      mockContainer.appendChild(mockScrollElement);
    });

    /** Register the scroll element on pane-1, scrolled to 250. */
    function scrolledTo250() {
      registry.registerScrollContainer(
        "pane-1",
        "testScroll",
        mockScrollElement,
      );
      mockScrollElement.scrollTop = 250;
      registry.updateScrollPosition("pane-1", "testScroll", 250);
      return registry.get("pane-1")!.scrollContainers.get("testScroll")!;
    }

    it("should register scroll container", () => {
      registry.getOrCreate("pane-1", config());

      registry.registerScrollContainer(
        "pane-1",
        "testScroll",
        mockScrollElement,
      );

      const entry = registry.get("pane-1")!;
      expect(entry.scrollContainers.has("testScroll")).toBe(true);
    });

    it("should update scroll position when updateScrollPosition() is called", () => {
      registry.getOrCreate("pane-1", config());

      const scrollEntry = scrolledTo250();

      expect(scrollEntry.savedScrollTop).toBe(250);
    });

    it("should preserve scroll position during detach/attach cycle", async () => {
      attached(mockContainer);
      scrolledTo250();

      // Detach (simulates tab switch away). Moving it resets its scroll.
      registry.detach("pane-1");
      mockScrollElement.scrollTop = 0;

      // Re-attach (simulates tab switch back)
      const newContainer = document.createElement("div");
      document.body.appendChild(newContainer);
      registry.attach("pane-1", newContainer);
      await nextFrame();

      expect(mockScrollElement.scrollTop).toBe(250);
    });

    it("should handle element hidden before detach (critical bug fix test)", () => {
      attached(mockContainer);
      const scrollEntry = scrolledTo250();

      // A hidden element has no height, and reads scrollTop as 0
      mockScrollElement.style.display = "none";
      mockScrollElement.scrollTop = 0;
      registry.detach("pane-1");

      // Should preserve the scroll position from updateScrollPosition, not 0
      expect(scrollEntry.savedScrollTop).toBe(250);
    });

    it("should unregister scroll container and preserve savedScrollTop", async () => {
      registry.getOrCreate("pane-1", config());
      const scrollEntry = scrolledTo250();

      registry.unregisterScrollContainer("pane-1", "testScroll");

      expect(scrollEntry.savedScrollTop).toBe(250);
      expect(scrollEntry.element).toBeNull();

      // A remounted scroll element picks up where the last one was
      const remounted = document.createElement("div");
      registry.registerScrollContainer("pane-1", "testScroll", remounted);
      await nextFrame();
      expect(remounted.scrollTop).toBe(250);
    });
  });

  describe("Query Methods", () => {
    it("should return true from has() for existing pane", () => {
      registry.getOrCreate("pane-1", config());
      expect(registry.has("pane-1")).toBe(true);
    });

    it("should return false from has() for non-existent pane", () => {
      expect(registry.has("non-existent")).toBe(false);
    });

    it("should return pane entry from get()", () => {
      const entry = registry.getOrCreate("pane-1", config());
      expect(registry.get("pane-1")).toBe(entry);
    });

    it("should return undefined from get() for non-existent pane", () => {
      expect(registry.get("non-existent")).toBeUndefined();
    });

    it("should return all pane entries from getAll()", () => {
      registry.getOrCreate("pane-1", config("pane-1"));
      registry.getOrCreate("pane-2", config("pane-2"));

      const ids = registry.getAll().map((entry) => entry.paneId);
      expect(ids.sort()).toEqual(["pane-1", "pane-2"]);
    });

    it("should return all pane IDs from getAllIds()", () => {
      registry.getOrCreate("pane-1", config("pane-1"));
      registry.getOrCreate("pane-2", config("pane-2"));

      const ids = registry.getAllIds();
      expect(ids).toContain("pane-1");
      expect(ids).toContain("pane-2");
    });
  });

  describe("Update Config", () => {
    it("should update pane config with updateConfig()", () => {
      registry.getOrCreate("pane-1", { ...config(), tabId: "tab-1" });

      registry.updateConfig("pane-1", config("pane-1", "/test/file.ts"));

      const entry = registry.get("pane-1")!;
      expect(entry.config.pane.file).toBe("/test/file.ts");
      // It merges what it's given into the config it has
      expect(entry.config.tabId).toBe("tab-1");
    });

    it("should fire paneUpdated event when updateConfig() is called", () => {
      const listener = listenAfterCreate();

      registry.updateConfig("pane-1", config("pane-1", "/test/file.ts"));

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "paneUpdated",
          paneId: "pane-1",
        }),
      );
    });
  });
});
