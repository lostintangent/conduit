// @ts-nocheck
/**
 * @vitest-environment jsdom
 *
 * Minimal test to isolate FileTreeNormal memory issue
 */
import { describe, it, expect, vi } from "vitest";

// Add mocks BEFORE importing component
vi.mock("@/hooks/useFileSystemV2", () => ({
  useFileSystemV2: () => ({
    readDirectory: vi.fn().mockResolvedValue([]),
    onDirectoryListingChanged: vi.fn(() => () => {}),
  }),
}));

vi.mock("@/hooks/useGitV2", () => ({
  useGitV2: () => ({
    getStatus: vi.fn().mockResolvedValue({ branch: "main", files: new Map() }),
    onStatusChanged: vi.fn(() => () => {}),
    whenReady: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/hooks/useGitAvailable", () => ({
  useGitAvailable: () => ({
    isAvailable: true,
    isLoading: false,
  }),
}));

vi.mock("@/components/panes/editor/hooks/useScrollPersistence", () => ({
  useScrollPersistence: () => vi.fn(),
}));

import { FileTreeNormal } from "../../../../../src/renderer/components/panes/editor/components/FileTreePanel/FileTreeNormal";

describe("FileTreeNormal Minimal", () => {
  it("should import without crashing", () => {
    expect(FileTreeNormal).toBeDefined();
  });
});
