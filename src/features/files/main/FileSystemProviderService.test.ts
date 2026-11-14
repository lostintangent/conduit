import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

// Mock fs module to allow provider creation with non-existent paths
vi.mock("node:fs", async () => {
  const actual = await vi.importActual("node:fs");
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
  };
});

// Track created instances for test verification
interface MockProviderInstance {
  cwd: string;
  dispose: ReturnType<typeof vi.fn>;
  startWatching: ReturnType<typeof vi.fn>;
  stat: ReturnType<typeof vi.fn>;
  readDirectory: ReturnType<typeof vi.fn>;
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  rename: ReturnType<typeof vi.fn>;
  createDirectory: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
  isWatching: ReturnType<typeof vi.fn>;
  onDirectoryListingChanged: ReturnType<typeof vi.fn>;
  onFileContentChanged: ReturnType<typeof vi.fn>;
  onFileRenamed: ReturnType<typeof vi.fn>;
  onFileDeleted: ReturnType<typeof vi.fn>;
}

const createdInstances: MockProviderInstance[] = [];

vi.mock("./DiskFileSystemProvider", () => {
  return {
    DiskFileSystemProvider: class MockDiskFileSystemProvider {
      cwd: string;
      dispose = vi.fn().mockResolvedValue(undefined);
      startWatching = vi.fn().mockResolvedValue(undefined);
      stat = vi.fn();
      readDirectory = vi.fn();
      readFile = vi.fn();
      writeFile = vi.fn();
      delete = vi.fn();
      rename = vi.fn();
      createDirectory = vi.fn();
      exists = vi.fn();
      isWatching = vi.fn().mockReturnValue(true);
      onDirectoryListingChanged = vi.fn().mockReturnValue({ dispose: vi.fn() });
      onFileContentChanged = vi.fn().mockReturnValue({ dispose: vi.fn() });
      onFileRenamed = vi.fn().mockReturnValue({ dispose: vi.fn() });
      onFileDeleted = vi.fn().mockReturnValue({ dispose: vi.fn() });

      constructor(cwd: string) {
        this.cwd = cwd;
        createdInstances.push(this as MockProviderInstance);
      }
    },
  };
});

// ============================================================================
// Import after mocks
// ============================================================================

import { FileSystemProviderService } from "./FileSystemProviderService";

// ============================================================================
// Tests
// ============================================================================

describe("FileSystemProviderService", () => {
  // Ref-counting, the grace period and path keys are ProviderPool's, tested in
  // tests/ipc/ProviderPool.test.ts. These cover what the service adds.
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Clear tracked instances
    createdInstances.length = 0;
    // Reset singleton before each test
    FileSystemProviderService.resetInstance();
  });

  afterEach(() => {
    // Clean up singleton after each test
    FileSystemProviderService.resetInstance();
    vi.useRealTimers();
  });

  // ===========================================================================
  // Singleton Pattern
  // ===========================================================================

  describe("singleton pattern", () => {
    it("should return the same instance on multiple calls to getInstance", () => {
      const instance1 = FileSystemProviderService.getInstance();
      const instance2 = FileSystemProviderService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("should create new instance after resetInstance", () => {
      const instance1 = FileSystemProviderService.getInstance();
      FileSystemProviderService.resetInstance();
      const instance2 = FileSystemProviderService.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  // ===========================================================================
  // getProvider
  // ===========================================================================

  describe("getProvider()", () => {
    it("should create a new provider on first call", async () => {
      const service = FileSystemProviderService.getInstance();

      const provider = await service.getProvider("/test/project");

      expect(createdInstances.length).toBe(1);
      expect(provider).toBeDefined();
      expect(provider.cwd).toBe("/test/project");
    });

    it("should start watching on the new provider", async () => {
      const service = FileSystemProviderService.getInstance();

      const provider = await service.getProvider("/test/project");

      expect(provider.startWatching).toHaveBeenCalled();
    });

    it("should return the same provider instance for the same path", async () => {
      const service = FileSystemProviderService.getInstance();

      const provider1 = await service.getProvider("/test/project");
      const provider2 = await service.getProvider("/test/project");

      expect(provider1).toBe(provider2);
      expect(createdInstances.length).toBe(1);
    });
  });

  // ===========================================================================
  // releaseProvider
  // ===========================================================================

  describe("releaseProvider()", () => {
    it("should dispose provider after grace period when refCount is 0", async () => {
      const service = FileSystemProviderService.getInstance();

      const provider = await service.getProvider("/test/project");
      service.releaseProvider("/test/project");

      // Advance past grace period (5 seconds)
      await vi.advanceTimersByTimeAsync(5000);

      expect(provider.dispose).toHaveBeenCalled();
      expect(service.getExistingProvider("/test/project")).toBeNull();
    });

    it("should keep the provider if getProvider is called before expiry", async () => {
      const service = FileSystemProviderService.getInstance();

      const provider = await service.getProvider("/test/project");
      service.releaseProvider("/test/project");
      await vi.advanceTimersByTimeAsync(3000);

      const provider2 = await service.getProvider("/test/project");
      await vi.advanceTimersByTimeAsync(3000);

      expect(provider2).toBe(provider);
      expect(provider.dispose).not.toHaveBeenCalled();
      expect(service.getExistingProvider("/test/project")).toBe(provider);
    });
  });

  // ===========================================================================
  // getExistingProvider
  // ===========================================================================

  describe("getExistingProvider()", () => {
    it("should return null for unknown paths", () => {
      const service = FileSystemProviderService.getInstance();

      const result = service.getExistingProvider("/unknown/path");

      expect(result).toBeNull();
    });

    it("should return the provider without taking a reference", async () => {
      const service = FileSystemProviderService.getInstance();

      const provider = await service.getProvider("/test/project");
      expect(service.getExistingProvider("/test/project")).toBe(provider);

      // One release is enough to dispose it, so no second reference was taken
      service.releaseProvider("/test/project");
      await vi.advanceTimersByTimeAsync(5000);
      expect(provider.dispose).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // resetInstance
  // ===========================================================================

  describe("resetInstance()", () => {
    it("should dispose all providers", async () => {
      const service = FileSystemProviderService.getInstance();

      const provider1 = await service.getProvider("/test/project1");
      const provider2 = await service.getProvider("/test/project2");

      FileSystemProviderService.resetInstance();

      expect(provider1.dispose).toHaveBeenCalled();
      expect(provider2.dispose).toHaveBeenCalled();
    });
  });
});
