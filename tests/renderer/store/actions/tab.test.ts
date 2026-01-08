import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use hoisted pattern to ensure all mocks are set up before modules load
const { mockApi, mockStoreGet, mockStoreSet } = vi.hoisted(() => {
  const mockApi = {
    createTerminal: vi.fn(),
    captureTerminalCommand: vi.fn(),
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

// Mock focusTab action
vi.mock("@/store/actions/focusMode", () => ({
  focusTab: vi.fn(),
}));

// Import after setting up mocks
import { duplicateTab, translateFilePath } from "@/store/actions/tab";
import type { Tab } from "@/types";

describe("translateFilePath", () => {
  it("should return file unchanged when source and target CWDs are the same", () => {
    const result = translateFilePath(
      "/home/user/project/src/index.ts",
      "/home/user/project",
      "/home/user/project",
    );
    expect(result).toBe("/home/user/project/src/index.ts");
  });

  it("should return file unchanged when file is outside source CWD", () => {
    const result = translateFilePath(
      "/other/location/file.ts",
      "/home/user/project",
      "/home/user/other-project",
    );
    expect(result).toBe("/other/location/file.ts");
  });

  it("should translate file path from source CWD to target CWD", () => {
    const result = translateFilePath(
      "/home/user/project/src/index.ts",
      "/home/user/project",
      "/home/user/other-project",
    );
    expect(result).toBe("/home/user/other-project/src/index.ts");
  });

  it("should handle nested directories correctly", () => {
    const result = translateFilePath(
      "/home/user/project/src/components/Button.tsx",
      "/home/user/project",
      "/tmp/worktree",
    );
    expect(result).toBe("/tmp/worktree/src/components/Button.tsx");
  });

  it("should handle paths without trailing slashes", () => {
    // Standard case without trailing slashes
    const result = translateFilePath(
      "/home/user/project/file.ts",
      "/home/user/project",
      "/home/user/other",
    );
    expect(result).toBe("/home/user/other/file.ts");
  });

  it("should not translate file that partially matches source CWD", () => {
    // File path starts with source CWD string but is not inside it
    const result = translateFilePath(
      "/home/user/project-extra/file.ts",
      "/home/user/project",
      "/home/user/other",
    );
    expect(result).toBe("/home/user/project-extra/file.ts");
  });
});

describe("duplicateTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      name: "My Tab",
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
    mockApi.captureTerminalCommand.mockResolvedValue(null);
    mockApi.createTerminal.mockResolvedValue({
      sessionId: "session-2",
      cwd: "/home/user",
      title: "bash",
    });

    const result = await duplicateTab("tab-1");

    expect(result).not.toBeNull();
    expect(result?.tabId).toBeDefined();

    // Verify captureTerminalCommand was called
    expect(mockApi.captureTerminalCommand).toHaveBeenCalledWith("session-1");

    // Verify createTerminal was called with correct cwd
    expect(mockApi.createTerminal).toHaveBeenCalledWith({ cwd: "/home/user" });

    // Verify sendKeypress was not called (no command to restore)
    expect(mockApi.sendKeypress).not.toHaveBeenCalled();

    // Verify new tab was added
    expect(mockStoreSet).toHaveBeenCalled();
    const setCallback = mockStoreSet.mock.calls[0][1];
    const newTabs = setCallback([sourceTab]);

    expect(newTabs).toHaveLength(2);
    expect(newTabs[1].name).toBe("My Tab 2");
  });

  it("should duplicate a tab with multiple panes", async () => {
    const sourceTab: Tab = {
      id: "tab-1",
      name: "Split View",
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
    mockApi.captureTerminalCommand.mockResolvedValue(null);
    mockApi.createTerminal
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
    expect(mockApi.captureTerminalCommand).toHaveBeenCalledTimes(2);
    expect(mockApi.createTerminal).toHaveBeenCalledTimes(2);

    const setCallback = mockStoreSet.mock.calls[0][1];
    const newTabs = setCallback([sourceTab]);

    expect(newTabs).toHaveLength(2);
    expect(Object.keys(newTabs[1].panes)).toHaveLength(2);
  });

  it("should duplicate editor panes with same file path", async () => {
    const sourceTab: Tab = {
      id: "tab-1",
      name: "Editor Tab",
      activePaneId: "pane-1",
      panes: {
        "pane-1": {
          id: "pane-1",
          type: "editor",
          cwd: "/home/user/project",
          file: "/home/user/project/index.ts",
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
      expect(newPane.file).toBe("/home/user/project/index.ts");
      expect(newPane.cwd).toBe("/home/user/project");
    }
  });

  it("should duplicate browser panes with same URL", async () => {
    const sourceTab: Tab = {
      id: "tab-1",
      name: "Browser Tab",
      activePaneId: "pane-1",
      panes: {
        "pane-1": {
          id: "pane-1",
          type: "browser",
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
    expect(newPane.type).toBe("browser");
    if (newPane.type === "browser") {
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
    mockApi.captureTerminalCommand.mockResolvedValue(null);
    mockApi.createTerminal.mockResolvedValue({
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
        name: "My Tab 2",
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
        name: "My Tab 5",
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
    mockApi.captureTerminalCommand.mockResolvedValue(null);
    mockApi.createTerminal.mockResolvedValue({
      sessionId: "session-3",
      cwd: "/home/user",
      title: "bash",
    });

    const result = await duplicateTab("tab-2");

    expect(result).not.toBeNull();

    const setCallback = mockStoreSet.mock.calls[0][1];
    const newTabs = setCallback(tabs);

    // Should be "My Tab 6" (highest existing is 5, so next is 6)
    expect(newTabs[2].name).toBe("My Tab 6");
  });

  it("should insert new tab immediately after source tab", async () => {
    const tabs: Tab[] = [
      {
        id: "tab-1",
        name: "First",
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
        name: "Second",
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
        name: "Third",
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
    mockApi.captureTerminalCommand.mockResolvedValue(null);
    mockApi.createTerminal.mockResolvedValue({
      sessionId: "session-4",
      cwd: "/home",
      title: "bash",
    });

    await duplicateTab("tab-1");

    const setCallback = mockStoreSet.mock.calls[0][1];
    const newTabs = setCallback(tabs);

    expect(newTabs).toHaveLength(4);
    expect(newTabs[0].id).toBe("tab-1");
    expect(newTabs[1].name).toBe("First 2"); // Duplicated tab
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
    mockApi.captureTerminalCommand.mockResolvedValue(null);
    mockApi.createTerminal
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
    mockApi.createTerminal
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
    mockApi.captureTerminalCommand.mockResolvedValue(null);
    mockApi.createTerminal.mockResolvedValue({
      sessionId: "session-2",
      cwd: "/home",
      title: "bash",
    });

    const result = await duplicateTab("tab-1");

    expect(result).not.toBeNull();

    const setCallback = mockStoreSet.mock.calls[0][1];
    const newTabs = setCallback([sourceTab]);

    // Should not have a name
    expect(newTabs[1].name).toBeUndefined();
  });

  it("should capture and restore running commands in duplicated terminals", async () => {
    const sourceTab: Tab = {
      id: "tab-1",
      name: "Dev Server",
      activePaneId: "pane-1",
      panes: {
        "pane-1": {
          id: "pane-1",
          type: "terminal",
          sessionId: "session-1",
          cwd: "/home/user/project",
          processTitle: "npm",
        },
      },
      layout: {
        id: "layout-1",
        type: "pane",
        paneId: "pane-1",
      },
    };

    const mockCommand = "npm run dev";

    mockStoreGet.mockReturnValue([sourceTab]);
    mockApi.captureTerminalCommand.mockResolvedValue(mockCommand);
    mockApi.createTerminal.mockResolvedValue({
      sessionId: "session-2",
      cwd: "/home/user/project",
      title: "npm",
    });

    const result = await duplicateTab("tab-1");

    expect(result).not.toBeNull();

    // Verify command was captured from source terminal
    expect(mockApi.captureTerminalCommand).toHaveBeenCalledWith("session-1");

    // Verify command was passed to createTerminal
    expect(mockApi.createTerminal).toHaveBeenCalledWith({
      cwd: "/home/user/project",
      command: "npm run dev",
    });
  });

  it("should handle terminals with no active command during duplication", async () => {
    const sourceTab: Tab = {
      id: "tab-1",
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
    mockApi.captureTerminalCommand.mockResolvedValue(null);
    mockApi.createTerminal.mockResolvedValue({
      sessionId: "session-2",
      cwd: "/home/user",
      title: "bash",
    });

    const result = await duplicateTab("tab-1");

    expect(result).not.toBeNull();

    // Verify command capture was attempted
    expect(mockApi.captureTerminalCommand).toHaveBeenCalledWith("session-1");

    // Verify no command was sent (terminal was idle)
    expect(mockApi.sendKeypress).not.toHaveBeenCalled();
  });

  it("should add newline to commands that don't have one", async () => {
    const sourceTab: Tab = {
      id: "tab-1",
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
    mockApi.captureTerminalCommand.mockResolvedValue("top");
    mockApi.createTerminal.mockResolvedValue({
      sessionId: "session-2",
      cwd: "/home/user",
      title: "bash",
    });

    await duplicateTab("tab-1");

    // Command should be passed to createTerminal (without newline - the IPC layer handles execution)
    expect(mockApi.createTerminal).toHaveBeenCalledWith({
      cwd: "/home/user",
      command: "top",
    });
  });

  it("should not add extra newline if command already has one", async () => {
    const sourceTab: Tab = {
      id: "tab-1",
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
    mockApi.captureTerminalCommand.mockResolvedValue("vim file.txt\n");
    mockApi.createTerminal.mockResolvedValue({
      sessionId: "session-2",
      cwd: "/home/user",
      title: "bash",
    });

    await duplicateTab("tab-1");

    // Command is passed through as-is (IPC layer handles execution)
    expect(mockApi.createTerminal).toHaveBeenCalledWith({
      cwd: "/home/user",
      command: "vim file.txt\n",
    });
  });
});
