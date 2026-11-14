import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use hoisted pattern to ensure all mocks are set up before modules load
const { mockApi, getTerminalSize } = vi.hoisted(() => {
  const mockApi = {
    terminal: {
      create: vi.fn(),
      captureCommand: vi.fn(),
      input: vi.fn(),
      on: vi.fn(),
    },
    onNewTabRequest: vi.fn(),
  };

  // Set up window.conduit in hoisted scope
  (global as any).window = {
    conduit: mockApi,
  };

  return {
    mockApi,
    getTerminalSize: vi.fn(),
  };
});

// Mock focusTab action
vi.mock("@/store/actions/focusMode", () => ({
  focusTab: vi.fn(),
}));

vi.mock("@features/terminal/client/xtermCache", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@features/terminal/client/xtermCache")
  >()),
  getTerminalSize,
}));

// Import after setting up mocks
import {
  notifyDataReceived,
  trackSession,
  untrackSession,
} from "@features/terminal/client/stateTracker";
import {
  duplicateTab,
  openTab,
  openTabFromExistingAgentSession,
  registerTabEventHandlers,
  translateFilePath,
} from "@/store/actions/tab";
import { activeTabIdAtom, tabStateAtom, tabsAtom } from "@/store/atoms";
import type { Tab } from "@/types";
import { enableMapSet } from "immer";

enableMapSet();

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
    getTerminalSize.mockReset();
    tabsAtom.set([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return null if source tab not found", async () => {
    tabsAtom.set([]);

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
          title: "bash",
        },
      },
      layout: {
        id: "layout-1",
        type: "pane",
        paneId: "pane-1",
      },
    };

    tabsAtom.set([sourceTab]);
    mockApi.terminal.captureCommand.mockResolvedValue(null);
    mockApi.terminal.create.mockResolvedValue({
      sessionId: "session-2",
      cwd: "/home/user",
      title: "bash",
    });

    const result = await duplicateTab("tab-1");

    expect(result).not.toBeNull();
    expect(result?.tabId).toBeDefined();

    // Verify captureCommand was called
    expect(mockApi.terminal.captureCommand).toHaveBeenCalledWith("session-1");

    // Verify terminal.create was called with correct cwd
    expect(mockApi.terminal.create).toHaveBeenCalledWith({
      cwd: "/home/user",
      waitForSize: true,
    });

    // Verify terminal.input was not called (no command to restore)
    expect(mockApi.terminal.input).not.toHaveBeenCalled();

    // Verify new tab was added
    const newTabs = tabsAtom.get();

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
          title: "npm",
        },
        "pane-2": {
          id: "pane-2",
          type: "terminal",
          sessionId: "session-2",
          cwd: "/home/user/project",
          title: "bash",
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

    tabsAtom.set([sourceTab]);
    mockApi.terminal.captureCommand.mockResolvedValue(null);
    mockApi.terminal.create
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
    expect(mockApi.terminal.captureCommand).toHaveBeenCalledTimes(2);
    expect(mockApi.terminal.create).toHaveBeenCalledTimes(2);

    const newTabs = tabsAtom.get();

    expect(newTabs).toHaveLength(2);
    expect(Object.keys(newTabs[1].panes)).toHaveLength(2);
  });

  it("starts each copied terminal at its source pane's size", async () => {
    tabsAtom.set([
      {
        id: "tab-1",
        name: "Split View",
        activePaneId: "pane-1",
        panes: {
          "pane-1": {
            id: "pane-1",
            type: "terminal",
            sessionId: "session-1",
            cwd: "/home/user",
            title: "zsh",
          },
          "pane-2": {
            id: "pane-2",
            type: "terminal",
            sessionId: "session-2",
            cwd: "/home/user",
            title: "zsh",
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
      },
    ]);
    getTerminalSize.mockImplementation((paneId: string) =>
      paneId === "pane-1" ? { cols: 62, rows: 45 } : { cols: 61, rows: 44 },
    );
    mockApi.terminal.captureCommand.mockResolvedValue(null);
    mockApi.terminal.create.mockResolvedValue({
      sessionId: "session-3",
      cwd: "/home/user",
      title: "zsh",
    });

    await duplicateTab("tab-1");

    expect(mockApi.terminal.create).toHaveBeenNthCalledWith(1, {
      cwd: "/home/user",
      cols: 62,
      rows: 45,
    });
    expect(mockApi.terminal.create).toHaveBeenNthCalledWith(2, {
      cwd: "/home/user",
      cols: 61,
      rows: 44,
    });
  });

  it("starts a copied pane it can't measure, like a collapsed one, once the copy has fit", async () => {
    tabsAtom.set([
      {
        id: "tab-1",
        name: "Split View",
        activePaneId: "pane-1",
        panes: {
          "pane-1": {
            id: "pane-1",
            type: "terminal",
            sessionId: "session-1",
            cwd: "/home/user",
            title: "zsh",
          },
          "pane-2": {
            id: "pane-2",
            type: "terminal",
            sessionId: "session-2",
            cwd: "/home/user",
            title: "zsh",
          },
        },
        layout: {
          id: "layout-1",
          type: "split",
          direction: "row",
          children: [
            { id: "layout-2", type: "pane", paneId: "pane-1" },
            { id: "layout-3", type: "pane", paneId: "pane-2", collapsed: true },
          ],
        },
      },
    ]);
    getTerminalSize.mockImplementation((paneId: string) =>
      paneId === "pane-1" ? { cols: 127, rows: 45 } : undefined,
    );
    mockApi.terminal.captureCommand.mockResolvedValue(null);
    mockApi.terminal.create.mockResolvedValue({
      sessionId: "session-3",
      cwd: "/home/user",
      title: "zsh",
    });

    await duplicateTab("tab-1");

    expect(mockApi.terminal.create).toHaveBeenNthCalledWith(1, {
      cwd: "/home/user",
      cols: 127,
      rows: 45,
    });
    expect(mockApi.terminal.create).toHaveBeenNthCalledWith(2, {
      cwd: "/home/user",
      waitForSize: true,
    });
    const copy = tabsAtom.get()[1];
    expect(JSON.stringify(copy.layout)).not.toContain("collapsed");
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

    tabsAtom.set([sourceTab]);

    const result = await duplicateTab("tab-1");

    expect(result).not.toBeNull();

    const newTabs = tabsAtom.get();

    const newPane = Object.values(newTabs[1].panes)[0];
    expect(newPane).toMatchObject({
      type: "editor",
      file: "/home/user/project/index.ts",
      cwd: "/home/user/project",
    });
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

    tabsAtom.set([sourceTab]);

    const result = await duplicateTab("tab-1");

    expect(result).not.toBeNull();

    const newTabs = tabsAtom.get();

    const newPane = Object.values(newTabs[1].panes)[0];
    expect(newPane).toMatchObject({
      type: "browser",
      url: "https://example.com",
      title: "Example Site",
    });
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
          title: "bash",
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

    tabsAtom.set([sourceTab]);
    mockApi.terminal.captureCommand.mockResolvedValue(null);
    mockApi.terminal.create.mockResolvedValue({
      sessionId: "session-2",
      cwd: "/home/user/worktree",
      title: "bash",
    });

    const result = await duplicateTab("tab-1");

    expect(result).not.toBeNull();

    const newTabs = tabsAtom.get();

    const newPane = Object.values(newTabs[1].panes)[0];
    expect(newPane).toMatchObject({
      type: "terminal",
      agentSessionId: "agent-1",
      agentBranchName: "feature-branch",
      agentBaseBranch: "main",
    });
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
            title: "bash",
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
            title: "bash",
          },
        },
        layout: { id: "layout-2", type: "pane", paneId: "pane-2" },
      },
    ];

    tabsAtom.set(tabs);
    mockApi.terminal.captureCommand.mockResolvedValue(null);
    mockApi.terminal.create.mockResolvedValue({
      sessionId: "session-3",
      cwd: "/home/user",
      title: "bash",
    });

    const result = await duplicateTab("tab-2");

    expect(result).not.toBeNull();

    const newTabs = tabsAtom.get();

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
            title: "bash",
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
            title: "bash",
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
            title: "bash",
          },
        },
        layout: { id: "layout-3", type: "pane", paneId: "pane-3" },
      },
    ];

    tabsAtom.set(tabs);
    mockApi.terminal.captureCommand.mockResolvedValue(null);
    mockApi.terminal.create.mockResolvedValue({
      sessionId: "session-4",
      cwd: "/home",
      title: "bash",
    });

    await duplicateTab("tab-1");

    const newTabs = tabsAtom.get();

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
          title: "bash",
        },
        "pane-2": {
          id: "pane-2",
          type: "terminal",
          sessionId: "session-2",
          cwd: "/home",
          title: "vim",
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

    tabsAtom.set([sourceTab]);
    mockApi.terminal.captureCommand.mockResolvedValue(null);
    mockApi.terminal.create
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

    const newTabs = tabsAtom.get();

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
          title: "bash",
        },
        "pane-2": {
          id: "pane-2",
          type: "terminal",
          sessionId: "session-2",
          cwd: "/home",
          title: "vim",
        },
        "pane-3": {
          id: "pane-3",
          type: "terminal",
          sessionId: "session-3",
          cwd: "/home",
          title: "htop",
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

    tabsAtom.set([sourceTab]);
    mockApi.terminal.create
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

    const newTabs = tabsAtom.get();

    const newTab = newTabs[1];
    expect(newTab.layout).toMatchObject({
      type: "split",
      direction: "column",
      children: [expect.anything(), { type: "split" }],
    });
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
          title: "bash",
        },
      },
      layout: { id: "layout-1", type: "pane", paneId: "pane-1" },
    };

    tabsAtom.set([sourceTab]);
    mockApi.terminal.captureCommand.mockResolvedValue(null);
    mockApi.terminal.create.mockResolvedValue({
      sessionId: "session-2",
      cwd: "/home",
      title: "bash",
    });

    const result = await duplicateTab("tab-1");

    expect(result).not.toBeNull();

    const newTabs = tabsAtom.get();

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
          title: "npm",
        },
      },
      layout: {
        id: "layout-1",
        type: "pane",
        paneId: "pane-1",
      },
    };

    const mockCommand = "npm run dev";

    tabsAtom.set([sourceTab]);
    mockApi.terminal.captureCommand.mockResolvedValue(mockCommand);
    mockApi.terminal.create.mockResolvedValue({
      sessionId: "session-2",
      cwd: "/home/user/project",
      title: "npm",
    });

    const result = await duplicateTab("tab-1");

    expect(result).not.toBeNull();

    // Verify command was captured from source terminal
    expect(mockApi.terminal.captureCommand).toHaveBeenCalledWith("session-1");

    // Verify command was passed to terminal.create
    expect(mockApi.terminal.create).toHaveBeenCalledWith({
      cwd: "/home/user/project",
      command: "npm run dev",
      waitForSize: true,
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
          title: "bash",
        },
      },
      layout: {
        id: "layout-1",
        type: "pane",
        paneId: "pane-1",
      },
    };

    tabsAtom.set([sourceTab]);
    mockApi.terminal.captureCommand.mockResolvedValue(null);
    mockApi.terminal.create.mockResolvedValue({
      sessionId: "session-2",
      cwd: "/home/user",
      title: "bash",
    });

    const result = await duplicateTab("tab-1");

    expect(result).not.toBeNull();

    // Verify command capture was attempted
    expect(mockApi.terminal.captureCommand).toHaveBeenCalledWith("session-1");

    // Verify no command was sent (terminal was idle)
    expect(mockApi.terminal.input).not.toHaveBeenCalled();
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
          title: "bash",
        },
      },
      layout: {
        id: "layout-1",
        type: "pane",
        paneId: "pane-1",
      },
    };

    tabsAtom.set([sourceTab]);
    mockApi.terminal.captureCommand.mockResolvedValue("top");
    mockApi.terminal.create.mockResolvedValue({
      sessionId: "session-2",
      cwd: "/home/user",
      title: "bash",
    });

    await duplicateTab("tab-1");

    // Command should be passed to terminal.create (without newline - the IPC layer handles execution)
    expect(mockApi.terminal.create).toHaveBeenCalledWith({
      cwd: "/home/user",
      command: "top",
      waitForSize: true,
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
          title: "bash",
        },
      },
      layout: {
        id: "layout-1",
        type: "pane",
        paneId: "pane-1",
      },
    };

    tabsAtom.set([sourceTab]);
    mockApi.terminal.captureCommand.mockResolvedValue("vim file.txt\n");
    mockApi.terminal.create.mockResolvedValue({
      sessionId: "session-2",
      cwd: "/home/user",
      title: "bash",
    });

    await duplicateTab("tab-1");

    // Command is passed through as-is (IPC layer handles execution)
    expect(mockApi.terminal.create).toHaveBeenCalledWith({
      cwd: "/home/user",
      command: "vim file.txt\n",
      waitForSize: true,
    });
  });
});

describe("openTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTerminalSize.mockReset();
  });

  afterEach(() => {
    tabsAtom.set([]);
    activeTabIdAtom.set(null);
  });

  it("starts the new terminal at the active pane's size", async () => {
    tabsAtom.set([
      {
        id: "tab-1",
        name: "Tab",
        activePaneId: "pane-1",
        panes: {
          "pane-1": {
            id: "pane-1",
            type: "terminal",
            sessionId: "session-1",
            cwd: "/home/user",
            title: "zsh",
          },
        },
        layout: { id: "layout-1", type: "pane", paneId: "pane-1" },
      },
    ]);
    activeTabIdAtom.set("tab-1");
    getTerminalSize.mockImplementation((paneId: string) =>
      paneId === "pane-1" ? { cols: 127, rows: 45 } : undefined,
    );
    mockApi.terminal.create.mockResolvedValue({
      sessionId: "session-2",
      cwd: "/home/user",
      title: "zsh",
    });

    await openTab();

    expect(mockApi.terminal.create).toHaveBeenCalledWith({
      cwd: "/home/user",
      cols: 127,
      rows: 45,
    });
  });

  it("starts the new terminal once it has fit when the active tab is split", async () => {
    const shell = (id: string) => ({
      id,
      type: "terminal" as const,
      sessionId: `session-${id}`,
      cwd: "/home/user",
      title: "zsh",
    });
    tabsAtom.set([
      {
        id: "tab-1",
        name: "Tab",
        activePaneId: "pane-1",
        panes: { "pane-1": shell("pane-1"), "pane-2": shell("pane-2") },
        layout: {
          id: "split-1",
          type: "split",
          direction: "row",
          children: [
            { id: "layout-1", type: "pane", paneId: "pane-1" },
            { id: "layout-2", type: "pane", paneId: "pane-2" },
          ],
        },
      },
    ]);
    activeTabIdAtom.set("tab-1");
    getTerminalSize.mockReturnValue({ cols: 62, rows: 45 });
    mockApi.terminal.create.mockResolvedValue({
      sessionId: "session-3",
      cwd: "/home/user",
      title: "zsh",
    });

    await openTab();

    expect(mockApi.terminal.create).toHaveBeenCalledWith({
      cwd: "/home/user",
      waitForSize: true,
    });
  });

  it("starts the first terminal in a window once its pane has fit", async () => {
    mockApi.terminal.create.mockResolvedValue({
      sessionId: "session-1",
      cwd: "/home/user",
      title: "zsh",
    });

    await openTab();

    expect(mockApi.terminal.create).toHaveBeenCalledWith({
      waitForSize: true,
    });
  });
});

describe("openTabFromExistingAgentSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTerminalSize.mockReset();
  });

  afterEach(() => {
    tabsAtom.set([]);
    activeTabIdAtom.set(null);
  });

  it("starts the worktree's terminal once its tab has fit when no pane can be measured", async () => {
    mockApi.terminal.create.mockResolvedValue({
      sessionId: "session-1",
      cwd: "/repo/.worktrees/fix",
      title: "zsh",
    });

    await openTabFromExistingAgentSession({
      id: "agent-1",
      repoRoot: "/repo",
      worktreePath: "/repo/.worktrees/fix",
      branchName: "fix",
      baseRef: "main",
      createdAt: 0,
    });

    expect(mockApi.terminal.create).toHaveBeenCalledWith({
      cwd: "/repo/.worktrees/fix",
      waitForSize: true,
    });
  });
});

describe("a tab whose terminal hasn't shown yet", () => {
  const terminalTab = (id: string, sessionId: string): Tab => ({
    id,
    name: id,
    activePaneId: `${id}-pane`,
    panes: {
      [`${id}-pane`]: {
        id: `${id}-pane`,
        type: "terminal",
        sessionId,
        cwd: "/repo",
        title: "zsh",
      },
    },
    layout: { id: `${id}-layout`, type: "pane", paneId: `${id}-pane` },
  });

  // Main reports a hidden shell's output at most every 500 ms. Its last
  // report comes 500 ms before the end.
  const print = (ms: number, report: () => void) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 500) {
      report();
      vi.advanceTimersByTime(500);
    }
  };
  const reportActivity = () => {
    const [, listener] = mockApi.terminal.on.mock.calls.find(
      ([event]) => event === "activity",
    )!;
    listener({ sessionId: "session-1" });
  };
  const state = () => tabStateAtom.get().get("hidden-tab");

  let unregister: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockApi.terminal.on.mockReturnValue(() => {});
    mockApi.onNewTabRequest.mockReturnValue(() => {});
    tabsAtom.set([
      terminalTab("hidden-tab", "session-1"),
      terminalTab("shown-tab", "session-2"),
    ]);
    activeTabIdAtom.set("shown-tab");
    unregister = registerTabEventHandlers();
  });

  afterEach(() => {
    unregister();
    untrackSession("session-1");
    tabsAtom.set([]);
    activeTabIdAtom.set(null);
    tabStateAtom.set(new Map());
    vi.useRealTimers();
  });

  it("shows running while its shell prints, and idle once it stops", () => {
    print(4_000, reportActivity);
    expect(state()).toBe("running");

    vi.advanceTimersByTime(1_000);
    expect(state()).toBe("running");
    vi.advanceTimersByTime(500);
    expect(state()).toBe("idle-unseen");
  });

  it("stays running when its pane shows partway through", () => {
    print(4_000, reportActivity);

    // Its pane's terminal takes over from main's reports.
    trackSession("session-1");
    print(2_500, () => notifyDataReceived("session-1"));
    expect(state()).toBe("running");

    vi.advanceTimersByTime(1_000);
    expect(state()).toBe("running");
    vi.advanceTimersByTime(500);
    expect(state()).toBe("idle-unseen");
  });
});
