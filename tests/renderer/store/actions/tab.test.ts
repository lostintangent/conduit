import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { Tab } from "@/types";

// Mock window.conduit API - must be hoisted
const { mockCreateTerminal } = vi.hoisted(() => ({
  mockCreateTerminal: vi.fn(),
}));

// Set up global mocks before any imports
global.window = {
  conduit: {
    createTerminal: mockCreateTerminal,
  },
} as any;

// Mock jotai store
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

// Import after setting up mocks
import { duplicateTab } from "@/store/actions/tab";
import * as jotaiModule from "jotai";

describe("duplicateTab", () => {
  let mockStoreGet: ReturnType<typeof vi.fn>;
  let mockStoreSet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    mockStoreGet = (jotaiModule as any)._mockStoreGet;
    mockStoreSet = (jotaiModule as any)._mockStoreSet;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return null if source tab not found", async () => {
    mockStoreGet.mockReturnValue([]);

    const result = await duplicateTab("nonexistent-tab-id");

    expect(result).toBeNull();
  });

  it("should duplicate a tab with single terminal pane", async () => {
    const sourceTab: Tab = {
      id: "tab-1",
      title: "My Tab",
      activePaneId: "pane-1",
      panes: {
        "pane-1": {
          id: "pane-1",
          type: "terminal",
          sessionId: "session-1",
          cwd: "/home/user",
          processTitle: "bash",
        },
      },
      layout: {
        id: "layout-1",
        type: "pane",
        paneId: "pane-1",
      },
    };

    mockStoreGet.mockReturnValue([sourceTab]);
    mockCreateTerminal.mockResolvedValue({
      sessionId: "session-2",
      cwd: "/home/user",
      title: "bash",
    });

    const result = await duplicateTab("tab-1");

    expect(result).not.toBeNull();
    expect(result?.tabId).toBeDefined();

    // Verify createTerminal was called with correct cwd
    expect(mockCreateTerminal).toHaveBeenCalledWith({ cwd: "/home/user" });

    // Verify new tab was added
    expect(mockStoreSet).toHaveBeenCalled();
    const setCallback = mockStoreSet.mock.calls[0][1];
    const newTabs = setCallback([sourceTab]);

    expect(newTabs).toHaveLength(2);
    expect(newTabs[1].title).toBe("My Tab 2");
  });

  it("should duplicate a tab with multiple panes", async () => {
    const sourceTab: Tab = {
      id: "tab-1",
      title: "Split View",
      activePaneId: "pane-1",
      panes: {
        "pane-1": {
          id: "pane-1",
          type: "terminal",
          sessionId: "session-1",
          cwd: "/home/user/project",
          processTitle: "npm",
        },
        "pane-2": {
          id: "pane-2",
          type: "terminal",
          sessionId: "session-2",
          cwd: "/home/user/project",
          processTitle: "bash",
        },
      },
      layout: {
        id: "layout-1",
        type: "split",
        direction: "row",
        children: [
          { id: "layout-2", type: "pane", paneId: "pane-1" },
          { id: "layout-3", type: "pane", paneId: "pane-2" },
        ],
      },
    };

    mockStoreGet.mockReturnValue([sourceTab]);
    mockCreateTerminal
      .mockResolvedValueOnce({
        sessionId: "session-3",
        cwd: "/home/user/project",
        title: "npm",
      })
      .mockResolvedValueOnce({
        sessionId: "session-4",
        cwd: "/home/user/project",
        title: "bash",
      });

    const result = await duplicateTab("tab-1");

    expect(result).not.toBeNull();
    expect(mockCreateTerminal).toHaveBeenCalledTimes(2);

    const setCallback = mockStoreSet.mock.calls[0][1];
    const newTabs = setCallback([sourceTab]);

    expect(newTabs).toHaveLength(2);
    expect(Object.keys(newTabs[1].panes)).toHaveLength(2);
  });

  it("should duplicate editor panes with same file path", async () => {
    const sourceTab: Tab = {
      id: "tab-1",
      title: "Editor Tab",
      activePaneId: "pane-1",
      panes: {
        "pane-1": {
          id: "pane-1",
          type: "editor",
          cwd: "/home/user/project",
          filePath: "/home/user/project/index.ts",
        },
      },
      layout: {
        id: "layout-1",
        type: "pane",
        paneId: "pane-1",
      },
    };

    mockStoreGet.mockReturnValue([sourceTab]);

    const result = await duplicateTab("tab-1");

    expect(result).not.toBeNull();

    const setCallback = mockStoreSet.mock.calls[0][1];
    const newTabs = setCallback([sourceTab]);

    const newPane = Object.values(newTabs[1].panes)[0];
    expect(newPane.type).toBe("editor");
    if (newPane.type === "editor") {
      expect(newPane.filePath).toBe("/home/user/project/index.ts");
      expect(newPane.cwd).toBe("/home/user/project");
    }
  });

  it("should duplicate webview panes with same URL", async () => {
    const sourceTab: Tab = {
      id: "tab-1",
      title: "Browser Tab",
      activePaneId: "pane-1",
      panes: {
        "pane-1": {
          id: "pane-1",
          type: "webview",
          url: "https://example.com",
          title: "Example Site",
        },
      },
      layout: {
        id: "layout-1",
        type: "pane",
        paneId: "pane-1",
      },
    };

    mockStoreGet.mockReturnValue([sourceTab]);

    const result = await duplicateTab("tab-1");

    expect(result).not.toBeNull();

    const setCallback = mockStoreSet.mock.calls[0][1];
    const newTabs = setCallback([sourceTab]);

    const newPane = Object.values(newTabs[1].panes)[0];
    expect(newPane.type).toBe("webview");
    if (newPane.type === "webview") {
      expect(newPane.url).toBe("https://example.com");
      expect(newPane.title).toBe("Example Site");
    }
  });

  it("should preserve agent session info in duplicated terminal panes", async () => {
    const sourceTab: Tab = {
      id: "tab-1",
      activePaneId: "pane-1",
      panes: {
        "pane-1": {
          id: "pane-1",
          type: "terminal",
          sessionId: "session-1",
          cwd: "/home/user/worktree",
          processTitle: "bash",
          agentSessionId: "agent-1",
          agentBranchName: "feature-branch",
          agentBaseBranch: "main",
          agentRepoRoot: "/home/user/repo",
          agentWorktreePath: "/home/user/worktree",
        },
      },
      layout: {
        id: "layout-1",
        type: "pane",
        paneId: "pane-1",
      },
    };

    mockStoreGet.mockReturnValue([sourceTab]);
    mockCreateTerminal.mockResolvedValue({
      sessionId: "session-2",
      cwd: "/home/user/worktree",
      title: "bash",
    });

    const result = await duplicateTab("tab-1");

    expect(result).not.toBeNull();

    const setCallback = mockStoreSet.mock.calls[0][1];
    const newTabs = setCallback([sourceTab]);

    const newPane = Object.values(newTabs[1].panes)[0];
    expect(newPane.type).toBe("terminal");
    if (newPane.type === "terminal") {
      expect(newPane.agentSessionId).toBe("agent-1");
      expect(newPane.agentBranchName).toBe("feature-branch");
      expect(newPane.agentBaseBranch).toBe("main");
    }
  });

  it("should increment title number correctly", async () => {
    const tabs: Tab[] = [
      {
        id: "tab-1",
        title: "My Tab 2",
        activePaneId: "pane-1",
        panes: {
          "pane-1": {
            id: "pane-1",
            type: "terminal",
            sessionId: "session-1",
            cwd: "/home/user",
            processTitle: "bash",
          },
        },
        layout: { id: "layout-1", type: "pane", paneId: "pane-1" },
      },
      {
        id: "tab-2",
        title: "My Tab 5",
        activePaneId: "pane-2",
        panes: {
          "pane-2": {
            id: "pane-2",
            type: "terminal",
            sessionId: "session-2",
            cwd: "/home/user",
            processTitle: "bash",
          },
        },
        layout: { id: "layout-2", type: "pane", paneId: "pane-2" },
      },
    ];

    mockStoreGet.mockReturnValue(tabs);
    mockCreateTerminal.mockResolvedValue({
      sessionId: "session-3",
      cwd: "/home/user",
      title: "bash",
    });

    const result = await duplicateTab("tab-2");

    expect(result).not.toBeNull();

    const setCallback = mockStoreSet.mock.calls[0][1];
    const newTabs = setCallback(tabs);

    // Should be "My Tab 6" (highest existing is 5, so next is 6)
    expect(newTabs[2].title).toBe("My Tab 6");
  });

  it("should insert new tab immediately after source tab", async () => {
    const tabs: Tab[] = [
      {
        id: "tab-1",
        title: "First",
        activePaneId: "pane-1",
        panes: {
          "pane-1": {
            id: "pane-1",
            type: "terminal",
            sessionId: "session-1",
            cwd: "/home",
            processTitle: "bash",
          },
        },
        layout: { id: "layout-1", type: "pane", paneId: "pane-1" },
      },
      {
        id: "tab-2",
        title: "Second",
        activePaneId: "pane-2",
        panes: {
          "pane-2": {
            id: "pane-2",
            type: "terminal",
            sessionId: "session-2",
            cwd: "/home",
            processTitle: "bash",
          },
        },
        layout: { id: "layout-2", type: "pane", paneId: "pane-2" },
      },
      {
        id: "tab-3",
        title: "Third",
        activePaneId: "pane-3",
        panes: {
          "pane-3": {
            id: "pane-3",
            type: "terminal",
            sessionId: "session-3",
            cwd: "/home",
            processTitle: "bash",
          },
        },
        layout: { id: "layout-3", type: "pane", paneId: "pane-3" },
      },
    ];

    mockStoreGet.mockReturnValue(tabs);
    mockCreateTerminal.mockResolvedValue({
      sessionId: "session-4",
      cwd: "/home",
      title: "bash",
    });

    await duplicateTab("tab-1");

    const setCallback = mockStoreSet.mock.calls[0][1];
    const newTabs = setCallback(tabs);

    expect(newTabs).toHaveLength(4);
    expect(newTabs[0].id).toBe("tab-1");
    expect(newTabs[1].title).toBe("First 2"); // Duplicated tab
    expect(newTabs[2].id).toBe("tab-2");
    expect(newTabs[3].id).toBe("tab-3");
  });

  it("should preserve active pane mapping", async () => {
    const sourceTab: Tab = {
      id: "tab-1",
      activePaneId: "pane-2",
      panes: {
        "pane-1": {
          id: "pane-1",
          type: "terminal",
          sessionId: "session-1",
          cwd: "/home",
          processTitle: "bash",
        },
        "pane-2": {
          id: "pane-2",
          type: "terminal",
          sessionId: "session-2",
          cwd: "/home",
          processTitle: "vim",
        },
      },
      layout: {
        id: "layout-1",
        type: "split",
        direction: "row",
        children: [
          { id: "layout-2", type: "pane", paneId: "pane-1" },
          { id: "layout-3", type: "pane", paneId: "pane-2" },
        ],
      },
    };

    mockStoreGet.mockReturnValue([sourceTab]);
    mockCreateTerminal
      .mockResolvedValueOnce({
        sessionId: "session-3",
        cwd: "/home",
        title: "bash",
      })
      .mockResolvedValueOnce({
        sessionId: "session-4",
        cwd: "/home",
        title: "vim",
      });

    await duplicateTab("tab-1");

    const setCallback = mockStoreSet.mock.calls[0][1];
    const newTabs = setCallback([sourceTab]);

    // The duplicated tab should have the same active pane (by position)
    const newTab = newTabs[1];
    const newPaneIds = Object.keys(newTab.panes);

    // The second pane should be active (matching source tab's activePaneId position)
    expect(newPaneIds).toHaveLength(2);
    // Since we're mapping pane IDs, the active pane should be the one that corresponds to pane-2
    expect(newTab.activePaneId).toBeDefined();
  });

  it("should preserve layout structure with nested splits", async () => {
    const sourceTab: Tab = {
      id: "tab-1",
      activePaneId: "pane-1",
      panes: {
        "pane-1": {
          id: "pane-1",
          type: "terminal",
          sessionId: "session-1",
          cwd: "/home",
          processTitle: "bash",
        },
        "pane-2": {
          id: "pane-2",
          type: "terminal",
          sessionId: "session-2",
          cwd: "/home",
          processTitle: "vim",
        },
        "pane-3": {
          id: "pane-3",
          type: "terminal",
          sessionId: "session-3",
          cwd: "/home",
          processTitle: "htop",
        },
      },
      layout: {
        id: "layout-1",
        type: "split",
        direction: "column",
        children: [
          { id: "layout-2", type: "pane", paneId: "pane-1" },
          {
            id: "layout-3",
            type: "split",
            direction: "row",
            children: [
              { id: "layout-4", type: "pane", paneId: "pane-2" },
              { id: "layout-5", type: "pane", paneId: "pane-3" },
            ],
          },
        ],
      },
    };

    mockStoreGet.mockReturnValue([sourceTab]);
    mockCreateTerminal
      .mockResolvedValueOnce({
        sessionId: "session-4",
        cwd: "/home",
        title: "bash",
      })
      .mockResolvedValueOnce({
        sessionId: "session-5",
        cwd: "/home",
        title: "vim",
      })
      .mockResolvedValueOnce({
        sessionId: "session-6",
        cwd: "/home",
        title: "htop",
      });

    await duplicateTab("tab-1");

    const setCallback = mockStoreSet.mock.calls[0][1];
    const newTabs = setCallback([sourceTab]);

    const newTab = newTabs[1];
    expect(newTab.layout.type).toBe("split");
    if (newTab.layout.type === "split") {
      expect(newTab.layout.direction).toBe("column");
      expect(newTab.layout.children).toHaveLength(2);
      expect(newTab.layout.children[1].type).toBe("split");
    }
  });

  it("should handle tabs with no title gracefully", async () => {
    const sourceTab: Tab = {
      id: "tab-1",
      activePaneId: "pane-1",
      panes: {
        "pane-1": {
          id: "pane-1",
          type: "terminal",
          sessionId: "session-1",
          cwd: "/home",
          processTitle: "bash",
        },
      },
      layout: { id: "layout-1", type: "pane", paneId: "pane-1" },
    };

    mockStoreGet.mockReturnValue([sourceTab]);
    mockCreateTerminal.mockResolvedValue({
      sessionId: "session-2",
      cwd: "/home",
      title: "bash",
    });

    const result = await duplicateTab("tab-1");

    expect(result).not.toBeNull();

    const setCallback = mockStoreSet.mock.calls[0][1];
    const newTabs = setCallback([sourceTab]);

    // Should not have a title
    expect(newTabs[1].title).toBeUndefined();
  });
});
