import * as monaco from "monaco-editor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Mocks - Using vi.hoisted for proper module hoisting
// ============================================================================

const { mockFsApi, MockFileSystemV2API, mockFsService, mockFsServiceInstance } =
  vi.hoisted(() => {
    const mockFsApi = {
      stat: vi.fn(),
      readTextFile: vi.fn(),
      writeTextFile: vi.fn(),
      onAnyFileContentChanged: vi.fn(() => vi.fn()),
      onAnyFileDeleted: vi.fn(() => vi.fn()),
      onAnyFileRenamed: vi.fn(() => vi.fn()),
      release: vi.fn(),
    };

    // Track API instances by cwd
    const instances = new Map<string, any>();

    // Mock FileSystemV2API class
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
      MockFileSystemV2API: MockAPI,
      mockFsService: service,
      mockFsServiceInstance: serviceInstance,
      getInstances: () => instances,
      clearInstances: () => instances.clear(),
    };
  });

// Mock FileSystemV2API using the full source path
vi.mock("../../../src/renderer/api/FileSystemV2API", () => ({
  FileSystemV2API: MockFileSystemV2API,
}));

// Mock FileSystemV2APIService
vi.mock("../../../src/renderer/services/FileSystemV2APIService", () => ({
  FileSystemV2APIService: mockFsService,
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
  createModelKey,
  pathToUri,
  uriToPath,
} from "../../../src/renderer/components/panes/editor-v2/registry/MonacoModelRegistry";

// ============================================================================
// Tests
// ============================================================================

describe("MonacoModelRegistry", () => {
  beforeEach(() => {
    MonacoModelRegistry.resetInstance();
    mockFsService.resetInstance();
    vi.clearAllMocks();
    monacoMock.__testHelpers.resetContentChangeHandler();
    monacoMock.__testHelpers.resetVersionCounter();

    // Default mock behavior
    mockFsApi.stat.mockResolvedValue({ size: 100 }); // Default small file size
    mockFsApi.readTextFile.mockResolvedValue("file content");
    mockFsApi.writeTextFile.mockResolvedValue(undefined);

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
      expect(mockFsApi.readTextFile).toHaveBeenCalledWith("/test/file.ts");
    });

    it("should return existing model when called with same path", async () => {
      const registry = MonacoModelRegistry.getInstance();

      const model1 = await registry.getOrCreateModel("/test/file.ts", "/test");
      const model2 = await registry.getOrCreateModel("/test/file.ts", "/test");

      expect(model1).toBe(model2);
      expect(registry.modelCount).toBe(1);
      // Should only read file once
      expect(mockFsApi.readTextFile).toHaveBeenCalledTimes(1);
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

      expect(mockFsApi.writeTextFile).toHaveBeenCalledWith(
        "/test/file.ts",
        model.getValue(),
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

      await expect(registry.saveModel("file:///nonexistent")).rejects.toThrow();
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
      mockFsApi.readTextFile.mockResolvedValue("new content");

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

  // ===========================================================================
  // VM Isolation
  // ===========================================================================

  describe("VM isolation", () => {
    describe("createModelKey", () => {
      it("should create key without sandboxId suffix for local files", () => {
        const key = createModelKey("/local/path/file.ts");
        const expectedUri = pathToUri("/local/path/file.ts");

        expect(key).toBe(expectedUri);
        expect(key).not.toContain("::vm:");
      });

      it("should create key with sandboxId suffix for VM files", () => {
        const key = createModelKey("/vm/path/file.ts", "vm-123");
        const expectedUri = pathToUri("/vm/path/file.ts");

        expect(key).toBe(`${expectedUri}::vm:vm-123`);
        expect(key).toContain("::vm:vm-123");
      });

      it("should create different keys for same path with different sandboxIds", () => {
        const path = "/shared/project/src/index.ts";
        const key1 = createModelKey(path, "vm-001");
        const key2 = createModelKey(path, "vm-002");

        expect(key1).not.toBe(key2);
        expect(key1).toContain("vm-001");
        expect(key2).toContain("vm-002");
      });

      it("should create same key for same path and sandboxId", () => {
        const path = "/shared/project/src/index.ts";
        const sandboxId = "vm-abc";

        const key1 = createModelKey(path, sandboxId);
        const key2 = createModelKey(path, sandboxId);

        expect(key1).toBe(key2);
      });
    });

    describe("model separation", () => {
      it("should create separate models for same path with different sandboxIds", async () => {
        const registry = MonacoModelRegistry.getInstance();
        const filePath = "/shared/project/src/main.ts";

        // Create models for two different VMs with the same file path
        const model1 = await registry.getOrCreateModel(filePath, "/", "vm-001");
        const model2 = await registry.getOrCreateModel(filePath, "/", "vm-002");

        // They should be different model instances
        expect(model1).not.toBe(model2);

        // Registry should have 2 models
        expect(registry.modelCount).toBe(2);
      });

      it("should return same model for same path and sandboxId", async () => {
        const registry = MonacoModelRegistry.getInstance();
        const filePath = "/shared/project/src/main.ts";
        const sandboxId = "vm-001";

        const model1 = await registry.getOrCreateModel(
          filePath,
          "/",
          sandboxId,
        );
        const model2 = await registry.getOrCreateModel(
          filePath,
          "/",
          sandboxId,
        );

        expect(model1).toBe(model2);
        expect(registry.modelCount).toBe(1);
      });

      it("should maintain independent content for same path with different sandboxIds", async () => {
        const registry = MonacoModelRegistry.getInstance();
        const filePath = "/shared/project/src/main.ts";

        // Create models for two different VMs
        const model1 = await registry.getOrCreateModel(filePath, "/", "vm-001");
        const model2 = await registry.getOrCreateModel(filePath, "/", "vm-002");

        // Simulate changing content in model1
        const newContent = "// Modified content for VM 001";
        model1.setValue(newContent);
        model1.getValue.mockReturnValue(newContent);

        // model2 should still have original content
        expect(model1.getValue()).toBe(newContent);
        expect(model2.getValue()).not.toBe(newContent);
      });

      it("should dispose VM model independently without affecting other VMs", async () => {
        const registry = MonacoModelRegistry.getInstance();
        const filePath = "/shared/project/src/main.ts";

        const model1 = await registry.getOrCreateModel(filePath, "/", "vm-001");
        const model2 = await registry.getOrCreateModel(filePath, "/", "vm-002");

        // Dispose the first VM's model using disposeModel
        const key1 = createModelKey(filePath, "vm-001");
        registry.disposeModel(key1);

        // model2 should still exist
        const key2 = createModelKey(filePath, "vm-002");
        const state2 = registry.getModelState(key2);

        expect(model1.dispose).toHaveBeenCalled();
        expect(model2.dispose).not.toHaveBeenCalled();
        expect(state2).not.toBeNull();
      });

      it("should track dirty state independently per VM", async () => {
        const registry = MonacoModelRegistry.getInstance();
        const filePath = "/shared/project/src/main.ts";

        const model1 = await registry.getOrCreateModel(filePath, "/", "vm-001");
        await registry.getOrCreateModel(filePath, "/", "vm-002");

        // Mark model1 as dirty by changing content
        const contentChangeHandler =
          monacoMock.__testHelpers.getContentChangeHandler();
        expect(contentChangeHandler).not.toBeNull();

        // Simulate content change on model1 (this triggers dirty state)
        model1.setValue("modified content");

        // Get states
        const key1 = createModelKey(filePath, "vm-001");
        const key2 = createModelKey(filePath, "vm-002");
        const state1 = registry.getModelState(key1);
        const state2 = registry.getModelState(key2);

        // Both states should exist independently
        expect(state1).not.toBeNull();
        expect(state2).not.toBeNull();
      });
    });

    describe("local vs VM model separation", () => {
      it("should create separate models for local and VM files with same path", async () => {
        const registry = MonacoModelRegistry.getInstance();
        const filePath = "/project/src/main.ts";

        // Create a local model (no sandboxId)
        const localModel = await registry.getOrCreateModel(filePath, "/");
        // Create a VM model with same path
        const vmModel = await registry.getOrCreateModel(
          filePath,
          "/",
          "vm-001",
        );

        expect(localModel).not.toBe(vmModel);
        expect(registry.modelCount).toBe(2);
      });

      it("should correctly key local and VM models differently", () => {
        const filePath = "/project/src/main.ts";

        const localKey = createModelKey(filePath);
        const vmKey = createModelKey(filePath, "vm-001");

        expect(localKey).not.toBe(vmKey);
        expect(localKey).not.toContain("::vm:");
        expect(vmKey).toContain("::vm:vm-001");
      });
    });
  });
});
