import type { Tab } from "@/types";
import type { Workspace, WorkspaceTab } from "@shared/types";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

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

// Mock workspace actions
vi.mock("@features/workspaces/client/actions", () => ({
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
import {
  previousTabsSnapshotAtom,
  workspaceHasChangesAtom,
  workspaceNameAtom,
  workspaceStateAtom,
} from "@/store/atoms";

describe("workspaceHandlers", () => {
  let mockTabs: Tab[];
  let mockSetShowCreateWorkspaceDialog: Mock<(show: boolean) => void>;

  const createMockTab = (id: string, title: string): Tab => {
    const paneId = `${id}-pane`;
    return {
      id,
      name: title,
      panes: {
        [paneId]: {
          id: paneId,
          type: "terminal",
          sessionId: `${paneId}-session`,
          cwd: null,
          title: "bash",
        },
      },
      layout: { id: `${id}-layout`, type: "pane", paneId },
      activePaneId: paneId,
    };
  };

  // Convert Tab[] to WorkspaceTab[] for mocking Workspace types
  const toWorkspaceTabs = (tabs: Tab[]): WorkspaceTab[] =>
    tabs.map((tab) => ({
      ...tab,
      panes: Object.values(tab.panes),
    }));

  beforeEach(() => {
    vi.clearAllMocks();

    mockTabs = [
      createMockTab("tab-1", "Tab 1"),
      createMockTab("tab-2", "Tab 2"),
    ];

    mockSetShowCreateWorkspaceDialog = vi.fn();

    // Reset the workspace atoms (set(undefined) is a no-op, so use an updater)
    workspaceNameAtom.set(() => undefined);
    workspaceStateAtom.set({ workspaces: [] });
    previousTabsSnapshotAtom.set("");
    workspaceHasChangesAtom.set(true);
  });

  describe("handleSaveWorkspace", () => {
    it("should save workspace when workspaceName exists", async () => {
      const activeTabId = "tab-1";
      const workspaceName = "my-workspace";
      const mockSessions: Workspace[] = [
        {
          name: workspaceName,
          lastModified: Date.now(),
          tabs: toWorkspaceTabs(mockTabs),
          activeTabId,
        },
      ];

      workspaceNameAtom.set(workspaceName);
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
      // workspaceStateAtom, previousTabsSnapshotAtom, workspaceHasChangesAtom
      expect(workspaceStateAtom.get()).toEqual({
        workspaces: mockSessions,
        lastWorkspace: mockSessions[0],
      });
      expect(previousTabsSnapshotAtom.get()).toBe(JSON.stringify(mockTabs));
      expect(workspaceHasChangesAtom.get()).toBe(false);
      expect(mockSetShowCreateWorkspaceDialog).not.toHaveBeenCalled();
    });

    it("should show create dialog when no workspaceName exists", async () => {
      const activeTabId = "tab-1";

      workspaceNameAtom.set(() => undefined);

      await handleSaveWorkspace(
        mockTabs,
        activeTabId,
        mockSetShowCreateWorkspaceDialog,
      );

      expect(mockWorkspaceApi.saveWorkspace).not.toHaveBeenCalled();
      expect(mockSetShowCreateWorkspaceDialog).toHaveBeenCalledWith(true);
    });

    it("should return early when activeTabId is undefined", async () => {
      const getWorkspaceName = vi.spyOn(workspaceNameAtom, "get");

      await handleSaveWorkspace(
        mockTabs,
        undefined,
        mockSetShowCreateWorkspaceDialog,
      );

      expect(getWorkspaceName).not.toHaveBeenCalled();
      getWorkspaceName.mockRestore();
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
          tabs: toWorkspaceTabs(mockTabs),
          activeTabId,
        },
      ];

      workspaceNameAtom.set(workspaceName);
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
      expect(workspaceStateAtom.get()).toEqual({
        workspaces: mockSessions,
        lastWorkspace: mockSessions[0],
      });
      expect(previousTabsSnapshotAtom.get()).toBe(JSON.stringify(mockTabs));
      expect(workspaceHasChangesAtom.get()).toBe(false);
    });
  });

  describe("handleCloseWorkspace", () => {
    it("should dynamically import and call closeWorkspace action", async () => {
      await handleCloseWorkspace();

      // The handler dynamically imports the action, so we need to get a reference to it
      const { closeWorkspace } =
        await import("@features/workspaces/client/actions");
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
      const { openWorkspace } =
        await import("@features/workspaces/client/actions");
      expect(openWorkspace).toHaveBeenCalledWith(mockWorkspace);
    });

    it("should not call openWorkspace when no last workspace exists", async () => {
      mockWorkspaceApi.getState.mockResolvedValue({
        workspaces: [],
        lastWorkspace: null,
      });

      await handleOpenLastWorkspace();

      expect(mockWorkspaceApi.getState).toHaveBeenCalled();
      const { openWorkspace } =
        await import("@features/workspaces/client/actions");
      expect(openWorkspace).not.toHaveBeenCalled();
    });
  });
});
