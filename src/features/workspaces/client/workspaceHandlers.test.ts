import type { Tab } from "@features/workbench/model";
import type { Workspace, WorkspaceTab } from "../model";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// Mock window.conduit BEFORE importing handlers
const mockWorkspaceApi = {
  getState: vi.fn(),
  saveWorkspace: vi.fn(),
};

global.window = {
  conduit: {
    workspaces: mockWorkspaceApi,
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
  handleSaveWorkspace,
} from "@features/workspaces/client/workspaceHandlers";
import { workspacesQuery } from "@features/workspaces/client/queries";
import { queryClient } from "@/query";
import { activeTabIdAtom, tabsAtom } from "@features/workbench/client/atoms";

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
      panes: Object.values(tab.panes) as WorkspaceTab["panes"],
    }));

  beforeEach(() => {
    vi.clearAllMocks();

    mockTabs = [
      createMockTab("tab-1", "Tab 1"),
      createMockTab("tab-2", "Tab 2"),
    ];

    mockSetShowCreateWorkspaceDialog = vi.fn();

    queryClient.clear();
    tabsAtom.set(mockTabs);
  });

  describe("handleSaveWorkspace", () => {
    it("saves the open workspace now", async () => {
      const activeTabId = "tab-1";
      const saved = {
        workspaces: [
          {
            name: "my-workspace",
            lastModified: Date.now(),
            tabs: toWorkspaceTabs(mockTabs),
            activeTabId,
          },
        ],
        current: "my-workspace",
      };
      queryClient.setQueryData(workspacesQuery.queryKey, {
        workspaces: [],
        current: "my-workspace",
      });
      activeTabIdAtom.set(activeTabId);
      mockWorkspaceApi.saveWorkspace.mockResolvedValue(saved);

      await handleSaveWorkspace(activeTabId, mockSetShowCreateWorkspaceDialog);

      expect(mockWorkspaceApi.saveWorkspace).toHaveBeenCalledWith(
        mockTabs,
        activeTabId,
        undefined,
      );
      expect(queryClient.getQueryData(workspacesQuery.queryKey)).toEqual(saved);
      expect(mockSetShowCreateWorkspaceDialog).not.toHaveBeenCalled();
    });

    it("asks for a name for the anonymous workspace", async () => {
      queryClient.setQueryData(workspacesQuery.queryKey, { workspaces: [] });

      await handleSaveWorkspace("tab-1", mockSetShowCreateWorkspaceDialog);

      expect(mockWorkspaceApi.saveWorkspace).not.toHaveBeenCalled();
      expect(mockSetShowCreateWorkspaceDialog).toHaveBeenCalledWith(true);
    });

    it("should return early when activeTabId is undefined", async () => {
      queryClient.setQueryData(workspacesQuery.queryKey, {
        workspaces: [],
        current: "my-workspace",
      });

      await handleSaveWorkspace(undefined, mockSetShowCreateWorkspaceDialog);

      expect(mockWorkspaceApi.saveWorkspace).not.toHaveBeenCalled();
      expect(mockSetShowCreateWorkspaceDialog).not.toHaveBeenCalled();
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
});
