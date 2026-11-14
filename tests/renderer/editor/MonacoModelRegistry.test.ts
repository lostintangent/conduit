import * as monaco from "monaco-editor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFiles } from "../files";

// ============================================================================
// Mocks - Using vi.hoisted for proper module hoisting
// ============================================================================

const {
  mockFsApi,
  MockFileSystemSubscription,
  mockFsService,
  mockFsServiceInstance,
} = vi.hoisted(() => {
  const mockFsApi = {
    onAnyFileContentChanged: vi.fn(() => vi.fn()),
    onAnyFileDeleted: vi.fn(() => vi.fn()),
    onAnyFileRenamed: vi.fn(() => vi.fn()),
    release: vi.fn(),
  };

  // Track API instances by cwd
  const instances = new Map<string, any>();

  // Mock FileSystemSubscription class
  class MockAPI {
    cwd: string;
    constructor(cwd: string) {
      this.cwd = cwd;
      // Copy all mock methods
      Object.assign(this, mockFsApi);
    }
  }

  // Mock service instance
  const serviceInstance = {
    acquire: vi.fn((cwd: string) => {
      let api = instances.get(cwd);
      if (!api) {
        api = new MockAPI(cwd);
        instances.set(cwd, api);
      }
      return api;
    }),
    release: vi.fn(),
    getRefCount: vi.fn(() => 0),
    hasInstance: vi.fn((cwd: string) => instances.has(cwd)),
    getStats: vi.fn(() => ({
      instanceCount: instances.size,
      totalRefCount: 0,
    })),
  };

  // Mock service class
  const service = {
    getInstance: vi.fn(() => serviceInstance),
    resetInstance: vi.fn(() => {
      instances.clear();
    }),
  };

  return {
    mockFsApi,
    MockFileSystemSubscription: MockAPI,
    mockFsService: service,
    mockFsServiceInstance: serviceInstance,
    getInstances: () => instances,
    clearInstances: () => instances.clear(),
  };
});

// Mock FileSystemSubscription using the full source path
vi.mock("@features/files/client/FileSystemSubscription", () => ({
  FileSystemSubscription: MockFileSystemSubscription,
}));

// Mock FileSystemSubscriptionPool
vi.mock("@features/files/client/FileSystemSubscriptionPool", () => ({
  FileSystemSubscriptionPool: mockFsService,
}));

// Access the mock helpers from our global monaco mock
const monacoMock = monaco as unknown as {
  editor: {
    createModel: ReturnType<typeof vi.fn>;
  };
  __testHelpers: {
    createMockModel: (
      content: string,
      language?: string,
      uri?: unknown,
    ) => ReturnType<typeof vi.fn>;
    getContentChangeHandler: () => ((e: unknown) => void) | null;
    resetContentChangeHandler: () => void;
    resetVersionCounter: () => void;
  };
};

// Import after mocks are set up
import {
  MonacoModelRegistry,
  pathToUri,
  uriToPath,
} from "../../../src/renderer/components/panes/editor/registry/MonacoModelRegistry";

// ============================================================================
// Tests
// ============================================================================

describe("MonacoModelRegistry", () => {
  let files: ReturnType<typeof mockFiles>;

  beforeEach(() => {
    MonacoModelRegistry.resetInstance();
    mockFsService.resetInstance();
    vi.clearAllMocks();
    monacoMock.__testHelpers.resetContentChangeHandler();
    monacoMock.__testHelpers.resetVersionCounter();

    // Default mock behavior
    // Include mtime so staleness check can skip re-reading unchanged files
    files = mockFiles();
    files.stat.mockResolvedValue({ size: 100, mtime: 1000 });
    files.readTextFile.mockResolvedValue("file content");

    // Reset model factory
    monacoMock.editor.createModel.mockImplementation(
      (content: string, language?: string, uri?: unknown) =>
        monacoMock.__testHelpers.createMockModel(content, language, uri),
    );
  });

  afterEach(() => {
    MonacoModelRegistry.resetInstance();
    mockFsService.resetInstance();
    vi.useRealTimers();
  });

  // ===========================================================================
  // Singleton Pattern
  // ===========================================================================

  describe("singleton", () => {
    it("should return the same instance on multiple calls", () => {
      const instance1 = MonacoModelRegistry.getInstance();
      const instance2 = MonacoModelRegistry.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("should create new instance after reset", () => {
      const instance1 = MonacoModelRegistry.getInstance();
      MonacoModelRegistry.resetInstance();
      const instance2 = MonacoModelRegistry.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  // ===========================================================================
  // getOrCreateModel
  // ===========================================================================

  describe("getOrCreateModel", () => {
    it("should create a new model when none exists", async () => {
      const registry = MonacoModelRegistry.getInstance();

      const model = await registry.getOrCreateModel("/test/file.ts", "/test");

      expect(model).toBeDefined();
      expect(registry.modelCount).toBe(1);
      expect(files.readTextFile).toHaveBeenCalledWith("/test/file.ts");
    });

    it("should return existing model when called with same path", async () => {
      const registry = MonacoModelRegistry.getInstance();

      const model1 = await registry.getOrCreateModel("/test/file.ts", "/test");
      const model2 = await registry.getOrCreateModel("/test/file.ts", "/test");

      expect(model1).toBe(model2);
      expect(registry.modelCount).toBe(1);
      // Note: readTextFile may be called more than once due to background staleness
      // check, but the model should only be created once (verified by modelCount)
      expect(files.readTextFile).toHaveBeenCalledWith("/test/file.ts");
    });

    it("should create separate models for different paths", async () => {
      const registry = MonacoModelRegistry.getInstance();

      const model1 = await registry.getOrCreateModel("/test/file1.ts", "/test");
      const model2 = await registry.getOrCreateModel("/test/file2.ts", "/test");

      expect(model1).not.toBe(model2);
      expect(registry.modelCount).toBe(2);
    });
  });

  // ===========================================================================
  // Reference Counting
  // ===========================================================================

  describe("reference counting", () => {
    it("should track references with addReference", async () => {
      const registry = MonacoModelRegistry.getInstance();
      const uri = pathToUri("/test/file.ts");

      await registry.getOrCreateModel("/test/file.ts", "/test");

      registry.addReference(uri, "editor-1");
      expect(registry.getReferenceCount(uri)).toBe(1);

      registry.addReference(uri, "editor-2");
      expect(registry.getReferenceCount(uri)).toBe(2);
    });

    it("should decrease references with removeReference", async () => {
      const registry = MonacoModelRegistry.getInstance();
      const uri = pathToUri("/test/file.ts");

      await registry.getOrCreateModel("/test/file.ts", "/test");
      registry.addReference(uri, "editor-1");
      registry.addReference(uri, "editor-2");

      registry.removeReference(uri, "editor-1");
      expect(registry.getReferenceCount(uri)).toBe(1);
    });

    it("should not duplicate references for same editor", async () => {
      const registry = MonacoModelRegistry.getInstance();
      const uri = pathToUri("/test/file.ts");

      await registry.getOrCreateModel("/test/file.ts", "/test");

      registry.addReference(uri, "editor-1");
      registry.addReference(uri, "editor-1"); // Same editor again

      expect(registry.getReferenceCount(uri)).toBe(1);
    });
  });

  // ===========================================================================
  // Grace Period and Disposal
  // ===========================================================================

  describe("grace period", () => {
    it("should schedule disposal when refCount drops to zero", async () => {
      vi.useFakeTimers();
      const registry = MonacoModelRegistry.getInstance();
      const uri = pathToUri("/test/file.ts");

      const model = await registry.getOrCreateModel("/test/file.ts", "/test");
      registry.addReference(uri, "editor-1");
      registry.removeReference(uri, "editor-1");

      // Model should still exist immediately
      expect(registry.hasModel(uri)).toBe(true);

      // Advance past grace period
      vi.advanceTimersByTime(6000);

      // Model should be disposed
      expect(registry.hasModel(uri)).toBe(false);
      expect(model.dispose).toHaveBeenCalled();
    });

    it("should cancel disposal if reference added during grace period", async () => {
      vi.useFakeTimers();
      const registry = MonacoModelRegistry.getInstance();
      const uri = pathToUri("/test/file.ts");

      await registry.getOrCreateModel("/test/file.ts", "/test");
      registry.addReference(uri, "editor-1");
      registry.removeReference(uri, "editor-1");

      // Advance partway through grace period
      vi.advanceTimersByTime(3000);

      // Add new reference
      registry.addReference(uri, "editor-2");

      // Advance past original grace period
      vi.advanceTimersByTime(3000);

      // Model should still exist (disposal was cancelled)
      expect(registry.hasModel(uri)).toBe(true);
    });
  });

  // ===========================================================================
  // Dirty Tracking (Version-Based)
  // ===========================================================================

  describe("dirty tracking", () => {
    it("should start as not dirty", async () => {
      const registry = MonacoModelRegistry.getInstance();
      const uri = pathToUri("/test/file.ts");

      await registry.getOrCreateModel("/test/file.ts", "/test");
      const state = registry.getModelState(uri);

      expect(state?.isDirty).toBe(false);
    });

    it("should fire dirty event when content changes", async () => {
      const registry = MonacoModelRegistry.getInstance();

      const model = await registry.getOrCreateModel("/test/file.ts", "/test");

      const dirtyEvents: boolean[] = [];
      registry.onModelStateChanged((event) => {
        if (event.type === "dirty") {
          dirtyEvents.push(event.isDirty);
        }
      });

      // Trigger content change by updating the model value
      // This increments the version ID and fires the content change handler
      model.setValue("modified content");

      // Should have received dirty event
      expect(dirtyEvents).toContain(true);
    });
  });

  // ===========================================================================
  // Save Model
  // ===========================================================================

  describe("saveModel", () => {
    it("should write content to file", async () => {
      const registry = MonacoModelRegistry.getInstance();
      const uri = pathToUri("/test/file.ts");

      const model = await registry.getOrCreateModel("/test/file.ts", "/test");

      await registry.saveModel(uri);

      expect(files.writeFile).toHaveBeenCalledWith(
        "/test",
        "/test/file.ts",
        new TextEncoder().encode(model.getValue()),
      );
    });

    it("should fire saved event", async () => {
      const registry = MonacoModelRegistry.getInstance();
      const uri = pathToUri("/test/file.ts");

      await registry.getOrCreateModel("/test/file.ts", "/test");

      let savedFired = false;
      registry.onModelStateChanged((event) => {
        if (event.type === "saved") {
          savedFired = true;
        }
      });

      await registry.saveModel(uri);

      expect(savedFired).toBe(true);
    });

    it("should throw if model does not exist", async () => {
      const registry = MonacoModelRegistry.getInstance();

      await expect(registry.saveModel("file:///nonexistent")).rejects.toThrow(
        "Model not found",
      );
    });
  });

  // ===========================================================================
  // Reload Model
  // ===========================================================================

  describe("reloadModel", () => {
    it("should read content from file and update model", async () => {
      const registry = MonacoModelRegistry.getInstance();
      const uri = pathToUri("/test/file.ts");

      const model = await registry.getOrCreateModel("/test/file.ts", "/test");
      files.readTextFile.mockResolvedValue("new content");

      await registry.reloadModel(uri);

      expect(model.setValue).toHaveBeenCalledWith("new content");
    });

    it("should fire reloaded event", async () => {
      const registry = MonacoModelRegistry.getInstance();
      const uri = pathToUri("/test/file.ts");

      await registry.getOrCreateModel("/test/file.ts", "/test");

      let reloadedFired = false;
      registry.onModelStateChanged((event) => {
        if (event.type === "reloaded") {
          reloadedFired = true;
        }
      });

      await registry.reloadModel(uri);

      expect(reloadedFired).toBe(true);
    });
  });

  // ===========================================================================
  // LRU Eviction
  // ===========================================================================

  describe("LRU eviction", () => {
    it("should evict unreferenced models when exceeding max", async () => {
      const registry = MonacoModelRegistry.getInstance();
      registry.setMaxModels(2);

      // Create 3 models with no references
      await registry.getOrCreateModel("/test/file1.ts", "/test");
      await registry.getOrCreateModel("/test/file2.ts", "/test");
      await registry.getOrCreateModel("/test/file3.ts", "/test");

      // Should only have 2 models (LRU eviction)
      expect(registry.modelCount).toBe(2);
    });
  });

  // ===========================================================================
  // Model State
  // ===========================================================================

  describe("getModelState", () => {
    it("should return undefined for non-existent model", () => {
      const registry = MonacoModelRegistry.getInstance();

      expect(registry.getModelState("file:///nonexistent")).toBeUndefined();
    });

    it("should return state for existing model", async () => {
      const registry = MonacoModelRegistry.getInstance();
      const uri = pathToUri("/test/file.ts");

      await registry.getOrCreateModel("/test/file.ts", "/test");
      const state = registry.getModelState(uri);

      expect(state).toEqual({
        isDirty: false,
        isOrphaned: false,
        hasExternalChanges: false,
      });
    });
  });

  // ===========================================================================
  // Utility Functions
  // ===========================================================================

  describe("utility functions", () => {
    it("pathToUri should convert file path to URI", () => {
      const uri = pathToUri("/test/file.ts");
      expect(uri).toContain("file://");
      expect(uri).toContain("/test/file.ts");
    });

    it("uriToPath should convert URI back to path", () => {
      const path = uriToPath("file:///test/file.ts");
      expect(path).toBe("/test/file.ts");
    });
  });

  // ===========================================================================
  // disposeAll
  // ===========================================================================

  describe("disposeAll", () => {
    it("should dispose all models", async () => {
      const registry = MonacoModelRegistry.getInstance();

      const model1 = await registry.getOrCreateModel("/test/file1.ts", "/test");
      const model2 = await registry.getOrCreateModel("/test/file2.ts", "/test");

      registry.disposeAll();

      expect(model1.dispose).toHaveBeenCalled();
      expect(model2.dispose).toHaveBeenCalled();
      expect(registry.modelCount).toBe(0);
    });
  });

  describe("filesystem API lifetime", () => {
    it("releases a cwd's filesystem API once its last model is disposed", async () => {
      const registry = MonacoModelRegistry.getInstance();
      await registry.getOrCreateModel("/test/file1.ts", "/test");
      await registry.getOrCreateModel("/test/file2.ts", "/test");

      registry.disposeModel(pathToUri("/test/file1.ts"));
      expect(mockFsServiceInstance.release).not.toHaveBeenCalled();

      registry.disposeModel(pathToUri("/test/file2.ts"));
      expect(mockFsServiceInstance.release).toHaveBeenCalledTimes(1);
      expect(mockFsServiceInstance.release).toHaveBeenCalledWith("/test");
    });
  });
});
