import type { Tab } from "@/store/atoms";
import type { Workspace } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock window.conduit BEFORE importing handlers
const mockWorkspaceApi = {
  getState: vi.fn(),
  saveWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
  renameWorkspace: vi.fn(),
  saveLastWorkspace: vi.fn(),
};

global.window = {
  conduit: {
    workspace: mockWorkspaceApi,
  },
} as any;

// Mock jotai store - using a factory pattern to avoid hoisting issues
vi.mock("jotai", async () => {
  const actual = await vi.importActual("jotai");
  const mockGet = vi.fn();
  const mockSet = vi.fn();

  return {
    ...actual,
    getDefaultStore: vi.fn(() => ({
      get: mockGet,
      set: mockSet,
    })),
    _mockStoreGet: mockGet,
    _mockStoreSet: mockSet,
  };
});

// Mock workspace actions
vi.mock("@/store/actions/workspace", () => ({
  closeWorkspace: vi.fn(),
  openWorkspace: vi.fn(),
}));

// Import handlers AFTER setting up mocks
import {
  handleCloseWorkspace,
  handleOpenLastWorkspace,
  handleOpenWorkspace,
  handleRenameWorkspace,
  handleSaveWorkspace,
} from "@/commands/handlers/workspaceHandlers";
import * as jotaiModule from "jotai";

describe("workspaceHandlers", () => {
  let mockTabs: Tab[];
  let mockSetShowCreateWorkspaceDialog: ReturnType<typeof vi.fn>;
  let mockStoreGet: ReturnType<typeof vi.fn>;
  let mockStoreSet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTabs = [
      { id: "tab-1", title: "Tab 1" },
      { id: "tab-2", title: "Tab 2" },
    ] as Tab[];

    mockSetShowCreateWorkspaceDialog = vi.fn();

    // Get references to the mock store methods
    mockStoreGet = (jotaiModule as any)._mockStoreGet;
    mockStoreSet = (jotaiModule as any)._mockStoreSet;
  });

  describe("handleSaveWorkspace", () => {
    it("should save workspace when workspaceName exists", async () => {
      const activeTabId = "tab-1";
      const workspaceName = "my-workspace";
      const mockSessions: Workspace[] = [
        {
          name: workspaceName,
          lastModified: Date.now(),
          tabs: mockTabs,
          activeTabId,
        },
      ];

      mockStoreGet.mockReturnValue(workspaceName);
      mockWorkspaceApi.saveWorkspace.mockResolvedValue({
        workspaces: mockSessions,
        lastWorkspace: mockSessions[0],
      });

      await handleSaveWorkspace(
        mockTabs,
        activeTabId,
        mockSetShowCreateWorkspaceDialog,
      );

      expect(mockWorkspaceApi.saveWorkspace).toHaveBeenCalledWith(
        workspaceName,
        mockTabs,
        activeTabId,
      );
      expect(mockStoreSet).toHaveBeenCalledTimes(3); // workspacesAtom, previousTabsSnapshotAtom, workspaceHasChangesAtom
      expect(mockSetShowCreateWorkspaceDialog).not.toHaveBeenCalled();
    });

    it("should show create dialog when no workspaceName exists", async () => {
      const activeTabId = "tab-1";

      mockStoreGet.mockReturnValue(undefined);

      await handleSaveWorkspace(
        mockTabs,
        activeTabId,
        mockSetShowCreateWorkspaceDialog,
      );

      expect(mockWorkspaceApi.saveWorkspace).not.toHaveBeenCalled();
      expect(mockSetShowCreateWorkspaceDialog).toHaveBeenCalledWith(true);
    });

    it("should return early when activeTabId is undefined", async () => {
      await handleSaveWorkspace(
        mockTabs,
        undefined,
        mockSetShowCreateWorkspaceDialog,
      );

      expect(mockStoreGet).not.toHaveBeenCalled();
      expect(mockWorkspaceApi.saveWorkspace).not.toHaveBeenCalled();
      expect(mockSetShowCreateWorkspaceDialog).not.toHaveBeenCalled();
    });

    it("should update atoms after successful save", async () => {
      const activeTabId = "tab-1";
      const workspaceName = "my-workspace";
      const mockSessions: Workspace[] = [
        {
          name: workspaceName,
          lastModified: Date.now(),
          tabs: mockTabs,
          activeTabId,
        },
      ];

      mockStoreGet.mockReturnValue(workspaceName);
      mockWorkspaceApi.saveWorkspace.mockResolvedValue({
        workspaces: mockSessions,
        lastWorkspace: mockSessions[0],
      });

      await handleSaveWorkspace(
        mockTabs,
        activeTabId,
        mockSetShowCreateWorkspaceDialog,
      );

      // Check that atoms were updated
      expect(mockStoreSet).toHaveBeenCalledWith(expect.anything(), {
        workspaces: mockSessions,
        lastWorkspace: mockSessions[0],
      }); // workspaceStateAtom
      expect(mockStoreSet).toHaveBeenCalledWith(
        expect.anything(),
        JSON.stringify(mockTabs),
      ); // previousTabsSnapshotAtom
      expect(mockStoreSet).toHaveBeenCalledWith(expect.anything(), false); // workspaceHasChangesAtom
    });
  });

  describe("handleCloseWorkspace", () => {
    it("should dynamically import and call closeWorkspace action", async () => {
      await handleCloseWorkspace();

      // The handler dynamically imports the action, so we need to get a reference to it
      const { closeWorkspace } = await import("@/store/actions/workspace");
      expect(closeWorkspace).toHaveBeenCalled();
    });
  });

  describe("handleRenameWorkspace", () => {
    it("should set show rename workspace dialog to true", () => {
      const setShowRenameWorkspaceDialog = vi.fn();

      handleRenameWorkspace(setShowRenameWorkspaceDialog);

      expect(setShowRenameWorkspaceDialog).toHaveBeenCalledWith(true);
    });
  });

  describe("handleOpenWorkspace", () => {
    it("should set show workspace picker to true", () => {
      const setShowWorkspacePicker = vi.fn();

      handleOpenWorkspace(setShowWorkspacePicker);

      expect(setShowWorkspacePicker).toHaveBeenCalledWith(true);
    });
  });

  describe("handleOpenLastWorkspace", () => {
    it("should load last workspace and call openWorkspace when workspace exists", async () => {
      const mockWorkspace: Workspace = {
        name: "test-workspace",
        lastModified: Date.now(),
        tabs: [],
        activeTabId: "tab-1",
      };
      mockWorkspaceApi.getState.mockResolvedValue({
        workspaces: [mockWorkspace],
        lastWorkspace: mockWorkspace,
      });

      await handleOpenLastWorkspace();

      expect(mockWorkspaceApi.getState).toHaveBeenCalled();
      const { openWorkspace } = await import("@/store/actions/workspace");
      expect(openWorkspace).toHaveBeenCalledWith(mockWorkspace);
    });

    it("should not call openWorkspace when no last workspace exists", async () => {
      mockWorkspaceApi.getState.mockResolvedValue({
        workspaces: [],
        lastWorkspace: null,
      });

      await handleOpenLastWorkspace();

      expect(mockWorkspaceApi.getState).toHaveBeenCalled();
      const { openWorkspace } = await import("@/store/actions/workspace");
      expect(openWorkspace).not.toHaveBeenCalled();
    });
  });
});
