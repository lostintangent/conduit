import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use hoisted pattern to ensure all mocks are set up before modules load
const { mockApi, mockStoreGet, mockStoreSet } = vi.hoisted(() => {
  const mockApi = {
    createTerminal: vi.fn(),
    sendKeypress: vi.fn(),
  };

  // Set up window.conduit in hoisted scope
  (global as any).window = {
    conduit: mockApi,
  };

  return {
    mockApi,
    mockStoreGet: vi.fn(),
    mockStoreSet: vi.fn(),
  };
});

vi.mock("jotai", async () => {
  const actual = await vi.importActual("jotai");
  return {
    ...actual,
    getDefaultStore: vi.fn(() => ({
      get: mockStoreGet,
      set: mockStoreSet,
    })),
  };
});

// Import after setting up mocks
import { openWorkspace } from "@/store/actions/workspace";
import type { Workspace } from "@shared/types";

describe("openWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should restore cloned panes with the same sessionId", async () => {
    // Create a workspace with two terminal panes that share the same sessionId (clones)
    const workspace: Workspace = {
      name: "test-workspace",
      lastModified: Date.now(),
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          activePaneId: "pane-1",
          layout: {
            id: "layout-1",
            type: "split",
            direction: "row",
            children: [
              { id: "layout-2", type: "pane", paneId: "pane-1" },
              { id: "layout-3", type: "pane", paneId: "pane-2" },
            ],
          },
          panes: [
            {
              id: "pane-1",
              type: "terminal",
              sessionId: "old-session-id", // Same sessionId (clones)
              cwd: "/home/user",
            },
            {
              id: "pane-2",
              type: "terminal",
              sessionId: "old-session-id", // Same sessionId (clones)
              cwd: "/home/user",
            },
          ],
        },
      ],
    };

    // Mock createTerminal to return a new sessionId
    mockApi.createTerminal.mockResolvedValue({
      sessionId: "new-session-id",
      cwd: "/home/user",
      title: "bash",
    });

    await openWorkspace(workspace);

    // Verify createTerminal was called only ONCE (for both cloned panes)
    expect(mockApi.createTerminal).toHaveBeenCalledTimes(1);

    // Verify the store was updated with tabs
    expect(mockStoreSet).toHaveBeenCalled();

    // Get the tabs that were set
    const setTabsCall = mockStoreSet.mock.calls.find(
      (call) =>
        Array.isArray(call[1]) && call[1].length > 0 && call[1][0].panes,
    );
    expect(setTabsCall).toBeDefined();

    const restoredTabs = setTabsCall![1];
    expect(restoredTabs).toHaveLength(1);

    const restoredTab = restoredTabs[0];
    expect(Object.keys(restoredTab.panes)).toHaveLength(2);

    // Both panes should have the same new sessionId
    const pane1 = restoredTab.panes["pane-1"];
    const pane2 = restoredTab.panes["pane-2"];

    expect(pane1.sessionId).toBe("new-session-id");
    expect(pane2.sessionId).toBe("new-session-id");
  });

  it("should create separate terminals for non-cloned panes", async () => {
    const workspace: Workspace = {
      name: "test-workspace",
      lastModified: Date.now(),
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          activePaneId: "pane-1",
          layout: {
            id: "layout-1",
            type: "split",
            direction: "row",
            children: [
              { id: "layout-2", type: "pane", paneId: "pane-1" },
              { id: "layout-3", type: "pane", paneId: "pane-2" },
            ],
          },
          panes: [
            {
              id: "pane-1",
              type: "terminal",
              sessionId: "session-1", // Different sessionId
              cwd: "/home/user",
            },
            {
              id: "pane-2",
              type: "terminal",
              sessionId: "session-2", // Different sessionId
              cwd: "/home/user",
            },
          ],
        },
      ],
    };

    // Mock createTerminal to return different sessionIds
    mockApi.createTerminal
      .mockResolvedValueOnce({
        sessionId: "new-session-1",
        cwd: "/home/user",
        title: "bash",
      })
      .mockResolvedValueOnce({
        sessionId: "new-session-2",
        cwd: "/home/user",
        title: "bash",
      });

    await openWorkspace(workspace);

    // Verify createTerminal was called TWICE (once for each pane)
    expect(mockApi.createTerminal).toHaveBeenCalledTimes(2);

    // Get the tabs that were set
    const setTabsCall = mockStoreSet.mock.calls.find(
      (call) =>
        Array.isArray(call[1]) && call[1].length > 0 && call[1][0].panes,
    );
    expect(setTabsCall).toBeDefined();

    const restoredTabs = setTabsCall![1];
    const restoredTab = restoredTabs[0];

    // Each pane should have its own new sessionId
    const pane1 = restoredTab.panes["pane-1"];
    const pane2 = restoredTab.panes["pane-2"];

    expect(pane1.sessionId).toBe("new-session-1");
    expect(pane2.sessionId).toBe("new-session-2");
  });

  it("should run command only once for cloned panes", async () => {
    const workspace: Workspace = {
      name: "test-workspace",
      lastModified: Date.now(),
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          activePaneId: "pane-1",
          layout: {
            id: "layout-1",
            type: "split",
            direction: "row",
            children: [
              { id: "layout-2", type: "pane", paneId: "pane-1" },
              { id: "layout-3", type: "pane", paneId: "pane-2" },
            ],
          },
          panes: [
            {
              id: "pane-1",
              type: "terminal",
              sessionId: "old-session-id",
              cwd: "/home/user",
              command: "npm run dev",
            },
            {
              id: "pane-2",
              type: "terminal",
              sessionId: "old-session-id", // Clone - same sessionId
              cwd: "/home/user",
              command: "npm run dev", // Same command
            },
          ],
        },
      ],
    };

    mockApi.createTerminal.mockResolvedValue({
      sessionId: "new-session-id",
      cwd: "/home/user",
      title: "bash",
    });

    await openWorkspace(workspace);

    // Verify the command was sent only ONCE (for the first pane in the clone group)
    expect(mockApi.sendKeypress).toHaveBeenCalledTimes(1);
    expect(mockApi.sendKeypress).toHaveBeenCalledWith(
      "new-session-id",
      "npm run dev\n",
    );
  });

  it("should preserve synchronized tab property", async () => {
    const workspace: Workspace = {
      name: "test-workspace",
      lastModified: Date.now(),
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          activePaneId: "pane-1",
          synchronized: true, // Tab is synchronized
          layout: {
            id: "layout-1",
            type: "pane",
            paneId: "pane-1",
          },
          panes: [
            {
              id: "pane-1",
              type: "terminal",
              cwd: "/home/user",
            },
          ],
        },
      ],
    };

    mockApi.createTerminal.mockResolvedValue({
      sessionId: "new-session-id",
      cwd: "/home/user",
      title: "bash",
    });

    await openWorkspace(workspace);

    // Get the tabs that were set
    const setTabsCall = mockStoreSet.mock.calls.find(
      (call) =>
        Array.isArray(call[1]) && call[1].length > 0 && call[1][0].panes,
    );
    expect(setTabsCall).toBeDefined();

    const restoredTabs = setTabsCall![1];
    const restoredTab = restoredTabs[0];

    // The synchronized property should be preserved
    expect(restoredTab.synchronized).toBe(true);
  });
});
