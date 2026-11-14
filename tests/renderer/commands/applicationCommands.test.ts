import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock window.conduit before importing modules that use it
// @ts-ignore
globalThis.window = globalThis.window || {};
// @ts-ignore
globalThis.window.conduit = {};

import {
  ApplicationCommands,
  registerApplicationCommands,
  _resetCommandRegistration,
} from "@/commands/applicationCommands";
import { hasActivePane } from "@/commands/contextKeys/appContextKeys";
import { ContextKeyService } from "@/commands/contextKeys/ContextKeyServiceImpl";
import { CommandRegistry } from "@/commands/core/CommandRegistryImpl";
import type { CommandDescriptor } from "@/commands/core/types";
import * as handlers from "@/commands/handlers";
import { useKeybindingDispatch } from "@/commands/hooks/useKeybindingDispatch";
import { KeybindingRegistry } from "@/commands/keybindings/KeybindingRegistry";
import * as focusModeActions from "@/store/actions/focusMode";
import { navigatePane } from "@/store/actions/paneNavigation";
import * as tabActions from "@/store/actions/tab";
import { notificationsAtom } from "@/store/atoms";
import type { Tab, TerminalPane } from "@/types";
import { renderHook } from "@testing-library/react";
import { commandContext } from "./fixtures";

// Mock store actions
vi.mock("@/store/actions/focusMode");
vi.mock("@/store/actions/tab");
vi.mock("@/commands/handlers");
vi.mock("@/store/actions/paneNavigation");

describe("applicationCommands", () => {
  let mockRegistry: CommandRegistry;
  let registeredCommands: Map<string, CommandDescriptor>;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetCommandRegistration(); // Reset idempotency flag for each test
    registeredCommands = new Map();

    mockRegistry = {
      registerCommand: vi.fn((descriptor: CommandDescriptor) => {
        registeredCommands.set(descriptor.id, descriptor);
        return { dispose: vi.fn() };
      }),
      executeCommand: vi.fn(),
      getCommand: vi.fn((id: string) => registeredCommands.get(id)),
      getAllCommands: vi.fn(() => Array.from(registeredCommands.values())),
      hasCommand: vi.fn((id: string) => registeredCommands.has(id)),
      setContextBuilder: vi.fn(),
    } as unknown as CommandRegistry;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("registerApplicationCommands", () => {
    it("should register all commands", () => {
      registerApplicationCommands(mockRegistry);

      expect(mockRegistry.registerCommand).toHaveBeenCalledTimes(81);

      // View commands
      expect(
        registeredCommands.has(ApplicationCommands.VIEW_TOGGLE_FOCUS_MODE),
      ).toBe(true);
      expect(
        registeredCommands.has(ApplicationCommands.VIEW_TOGGLE_DESIGN_MODE),
      ).toBe(true);
      expect(
        registeredCommands.has(ApplicationCommands.VIEW_OPEN_KEYBINDINGS),
      ).toBe(true);
      expect(
        registeredCommands.has(ApplicationCommands.VIEW_OPEN_PANE_ACTIONS),
      ).toBe(true);
      expect(
        registeredCommands.has(ApplicationCommands.VIEW_SHOW_COMMAND_PALETTE),
      ).toBe(true);
      expect(
        registeredCommands.has(ApplicationCommands.VIEW_RESET_LAYOUT),
      ).toBe(true);

      // Tab commands
      expect(registeredCommands.has(ApplicationCommands.TAB_NEW)).toBe(true);
      expect(registeredCommands.has(ApplicationCommands.TAB_CLOSE)).toBe(true);
      expect(registeredCommands.has(ApplicationCommands.TAB_DUPLICATE)).toBe(
        true,
      );
      expect(
        registeredCommands.has(ApplicationCommands.TAB_DUPLICATE_WITH_CWD),
      ).toBe(true);
      expect(
        registeredCommands.has(ApplicationCommands.TAB_DUPLICATE_INTO_WORKTREE),
      ).toBe(true);
      expect(registeredCommands.has(ApplicationCommands.TAB_RENAME)).toBe(true);

      // Workspace commands
      expect(registeredCommands.has(ApplicationCommands.WORKSPACE_SAVE)).toBe(
        true,
      );
      expect(registeredCommands.has(ApplicationCommands.WORKSPACE_RENAME)).toBe(
        true,
      );
      expect(
        registeredCommands.has(ApplicationCommands.WORKSPACE_DUPLICATE),
      ).toBe(true);
      expect(registeredCommands.has(ApplicationCommands.WORKSPACE_CLOSE)).toBe(
        true,
      );
      expect(registeredCommands.has(ApplicationCommands.WORKSPACE_OPEN)).toBe(
        true,
      );
      expect(
        registeredCommands.has(ApplicationCommands.WORKSPACE_OPEN_LAST),
      ).toBe(true);

      // Pane commands
      expect(
        registeredCommands.has(ApplicationCommands.PANE_OPEN_WEB_PAGE),
      ).toBe(true);
      expect(registeredCommands.has(ApplicationCommands.PANE_FOCUS)).toBe(true);
      expect(registeredCommands.has(ApplicationCommands.PANE_COLLAPSE)).toBe(
        true,
      );
      expect(registeredCommands.has(ApplicationCommands.PANE_EXPAND)).toBe(
        true,
      );
      expect(registeredCommands.has(ApplicationCommands.PANE_CLOSE)).toBe(true);
      expect(registeredCommands.has(ApplicationCommands.PANE_SPLIT_LEFT)).toBe(
        true,
      );
      expect(registeredCommands.has(ApplicationCommands.PANE_SPLIT_RIGHT)).toBe(
        true,
      );
      expect(registeredCommands.has(ApplicationCommands.PANE_SPLIT_TOP)).toBe(
        true,
      );
      expect(
        registeredCommands.has(ApplicationCommands.PANE_SPLIT_BOTTOM),
      ).toBe(true);
      expect(
        registeredCommands.has(ApplicationCommands.PANE_SPLIT_LEFT_AGENT),
      ).toBe(true);
      expect(
        registeredCommands.has(ApplicationCommands.PANE_SPLIT_RIGHT_AGENT),
      ).toBe(true);
      expect(
        registeredCommands.has(ApplicationCommands.PANE_SPLIT_TOP_AGENT),
      ).toBe(true);
      expect(
        registeredCommands.has(ApplicationCommands.PANE_SPLIT_BOTTOM_AGENT),
      ).toBe(true);
      expect(registeredCommands.has(ApplicationCommands.PANE_MOVE_LEFT)).toBe(
        true,
      );
      expect(registeredCommands.has(ApplicationCommands.PANE_MOVE_RIGHT)).toBe(
        true,
      );
      expect(registeredCommands.has(ApplicationCommands.PANE_MOVE_UP)).toBe(
        true,
      );
      expect(registeredCommands.has(ApplicationCommands.PANE_MOVE_DOWN)).toBe(
        true,
      );
      expect(registeredCommands.has(ApplicationCommands.PANE_MOVE_TO_TAB)).toBe(
        true,
      );

      // Terminal commands
      expect(
        registeredCommands.has(ApplicationCommands.TERMINAL_OPEN_IN_VSCODE),
      ).toBe(true);

      // Agent commands
      expect(registeredCommands.has(ApplicationCommands.AGENT_LAUNCH)).toBe(
        true,
      );
      expect(
        registeredCommands.has(ApplicationCommands.AGENT_MANAGE_SESSIONS),
      ).toBe(true);
      expect(
        registeredCommands.has(ApplicationCommands.AGENT_MERGE_AND_CLOSE),
      ).toBe(true);
      expect(registeredCommands.has(ApplicationCommands.AGENT_TERMINATE)).toBe(
        true,
      );
    });

    it("should register commands with unique IDs", () => {
      registerApplicationCommands(mockRegistry);

      const commandIds = Array.from(registeredCommands.keys());
      const uniqueIds = new Set(commandIds);

      expect(commandIds.length).toBe(uniqueIds.size);
    });

    it("should assign correct categories to commands", () => {
      registerApplicationCommands(mockRegistry);

      const allCommands = Array.from(registeredCommands.values());
      expect(allCommands.length).toBeGreaterThan(0);

      // View commands
      const viewCommands = allCommands.filter((cmd) =>
        cmd.id.startsWith("view."),
      );
      viewCommands.forEach((command) => {
        expect(command.category).toBe("View");
      });

      // Tab commands
      const tabCommands = allCommands.filter((cmd) =>
        cmd.id.startsWith("tab."),
      );
      tabCommands.forEach((command) => {
        expect(command.category).toBe("Tab");
      });

      // Workspace commands
      const workspaceCommands = allCommands.filter((cmd) =>
        cmd.id.startsWith("workspace."),
      );
      workspaceCommands.forEach((command) => {
        expect(command.category).toBe("Workspace");
      });

      // Pane commands
      const paneCommands = allCommands.filter((cmd) =>
        cmd.id.startsWith("pane."),
      );
      paneCommands.forEach((command) => {
        expect(command.category).toBe("Pane");
      });

      // Terminal commands
      const terminalCommands = allCommands.filter((cmd) =>
        cmd.id.startsWith("terminal."),
      );
      terminalCommands.forEach((command) => {
        expect(command.category).toBe("Terminal");
      });

      // Agent commands
      const agentCommands = allCommands.filter((cmd) =>
        cmd.id.startsWith("agent."),
      );
      agentCommands.forEach((command) => {
        expect(command.category).toBe("Agent");
      });

      // All commands should have a category
      allCommands.forEach((command) => {
        expect(command.category).toBeDefined();
      });
    });

    it("should assign keybindings to commands that have them defined", () => {
      registerApplicationCommands(mockRegistry);

      // Commands with keybindings defined
      const commandsWithKeybindings = [
        ApplicationCommands.VIEW_TOGGLE_FOCUS_MODE,
        ApplicationCommands.VIEW_TOGGLE_DESIGN_MODE,
        ApplicationCommands.VIEW_OPEN_KEYBINDINGS,
        ApplicationCommands.VIEW_SHOW_COMMAND_PALETTE,
        ApplicationCommands.WORKSPACE_SAVE,
        ApplicationCommands.WORKSPACE_RENAME,
        ApplicationCommands.WORKSPACE_CLOSE,
        ApplicationCommands.TAB_NEW,
        ApplicationCommands.TAB_DUPLICATE,
      ];

      commandsWithKeybindings.forEach((commandId) => {
        const command = registeredCommands.get(commandId);
        expect(command?.keybinding).toBeDefined();
        expect(command?.keybinding).toHaveProperty("key");
      });
    });
  });

  describe("command execution", () => {
    beforeEach(() => {
      registerApplicationCommands(mockRegistry);
    });

    describe("VIEW_TOGGLE_FOCUS_MODE", () => {
      it("should call toggleFocusMode action when activeTab exists", () => {
        const command = registeredCommands.get(
          ApplicationCommands.VIEW_TOGGLE_FOCUS_MODE,
        )!;
        const mockContext = commandContext({
          activeTab: { id: "tab-123", activePaneId: "pane-456" },
          activePaneId: "pane-456",
        });

        command.run(mockContext);

        expect(focusModeActions.toggleFocusMode).toHaveBeenCalledWith(
          "tab-123",
          "pane-456",
        );
      });

      it("should not call toggleFocusMode when activeTab is null", () => {
        const command = registeredCommands.get(
          ApplicationCommands.VIEW_TOGGLE_FOCUS_MODE,
        )!;
        const mockContext = commandContext();

        command.run(mockContext);

        expect(focusModeActions.toggleFocusMode).not.toHaveBeenCalled();
      });
    });

    describe("TAB_NEW", () => {
      it("should call openTab action", () => {
        const command = registeredCommands.get(ApplicationCommands.TAB_NEW)!;
        const mockContext = commandContext();

        command.run(mockContext);

        expect(tabActions.openTab).toHaveBeenCalled();
      });
    });

    describe("TAB_CLOSE", () => {
      it("should call closeTab action with activeTab id", () => {
        const command = registeredCommands.get(ApplicationCommands.TAB_CLOSE)!;
        const mockContext = commandContext({
          activeTab: { id: "tab-123" },
        });

        command.run(mockContext);

        expect(tabActions.closeTab).toHaveBeenCalledWith("tab-123");
      });

      it("should not call closeTab when activeTab is null", () => {
        const command = registeredCommands.get(ApplicationCommands.TAB_CLOSE)!;
        const mockContext = commandContext({
          activeTab: null,
        });

        command.run(mockContext);

        expect(tabActions.closeTab).not.toHaveBeenCalled();
      });
    });

    describe("TERMINAL_OPEN_IN_VSCODE", () => {
      it("should call handleOpenInVSCode handler with activeTab", () => {
        const command = registeredCommands.get(
          ApplicationCommands.TERMINAL_OPEN_IN_VSCODE,
        )!;
        const mockActiveTab = { id: "tab-123" };
        const mockContext = commandContext({
          activeTab: mockActiveTab,
        });

        command.run(mockContext);

        expect(handlers.handleOpenInVSCode).toHaveBeenCalledWith(mockActiveTab);
      });
    });

    describe("AGENT_MANAGE_SESSIONS", () => {
      it("should call handleManageSessions handler with context", () => {
        const command = registeredCommands.get(
          ApplicationCommands.AGENT_MANAGE_SESSIONS,
        )!;
        const mockContext = commandContext({
          agent: {
            showManageSessionsDialog: vi.fn(),
          },
        });

        command.run(mockContext);

        expect(handlers.handleManageSessions).toHaveBeenCalledWith(mockContext);
      });
    });

    describe("AGENT_MERGE_AND_CLOSE", () => {
      it("should call handleMergeAndClose handler with activeTab", () => {
        const command = registeredCommands.get(
          ApplicationCommands.AGENT_MERGE_AND_CLOSE,
        )!;
        const mockActiveTab = { id: "tab-123" };
        const mockContext = commandContext({
          activeTab: mockActiveTab,
        });

        command.run(mockContext);

        expect(handlers.handleMergeAndClose).toHaveBeenCalledWith(
          mockActiveTab,
        );
      });
    });

    describe("AGENT_TERMINATE", () => {
      it("should call handleTerminate handler with activeTab", () => {
        const command = registeredCommands.get(
          ApplicationCommands.AGENT_TERMINATE,
        )!;
        const mockActiveTab = { id: "tab-123" };
        const mockContext = commandContext({
          activeTab: mockActiveTab,
        });

        command.run(mockContext);

        expect(handlers.handleTerminate).toHaveBeenCalledWith(mockActiveTab);
      });
    });

    describe("AGENT_DELETE_ALL_WORKTREES", () => {
      it("should report removed and already-missing worktrees as deleted", async () => {
        const command = registeredCommands.get(
          ApplicationCommands.AGENT_DELETE_ALL_WORKTREES,
        )!;
        const agentPane = (id: string): TerminalPane => ({
          id,
          type: "terminal",
          sessionId: `pty-${id}`,
          cwd: `/worktrees/${id}`,
          title: id,
          agentSessionId: `session-${id}`,
          agentWorktreePath: `/worktrees/${id}`,
        });
        const tab: Tab = {
          id: "tab-1",
          name: "Agents",
          panes: { a: agentPane("a"), b: agentPane("b") },
          layout: { id: "root", type: "pane", paneId: "a" },
          activePaneId: "a",
        };
        const cleanupAgentSession = vi
          .fn()
          .mockResolvedValueOnce({ status: "removed" })
          .mockResolvedValueOnce({ status: "missing" });
        window.conduit.cleanupAgentSession = cleanupAgentSession;

        await command.run(commandContext({ activeTab: tab, allTabs: [tab] }));

        expect(cleanupAgentSession).toHaveBeenCalledTimes(2);
        const [latest] = notificationsAtom.get();
        expect(latest).toMatchObject({
          kind: "success",
          message: "Successfully deleted 2 worktrees",
        });
      });
    });

    describe("VIEW_TOGGLE_DESIGN_MODE", () => {
      it("should call handleToggleDesignMode handler", () => {
        const command = registeredCommands.get(
          ApplicationCommands.VIEW_TOGGLE_DESIGN_MODE,
        )!;
        const mockContext = commandContext({
          applicationMode: "normal",
          setApplicationMode: vi.fn(),
        });

        command.run(mockContext);

        expect(handlers.handleToggleDesignMode).toHaveBeenCalledWith(
          "normal",
          mockContext.setApplicationMode,
        );
      });
    });

    describe("VIEW_OPEN_KEYBINDINGS", () => {
      it("should call handleOpenKeyboardShortcuts handler", () => {
        const command = registeredCommands.get(
          ApplicationCommands.VIEW_OPEN_KEYBINDINGS,
        )!;
        const mockContext = commandContext({
          setShowKeybindingsEditor: vi.fn(),
        });

        command.run(mockContext);

        expect(handlers.handleOpenKeyboardShortcuts).toHaveBeenCalledWith(
          mockContext.setShowKeybindingsEditor,
        );
      });
    });

    describe("VIEW_SHOW_COMMAND_PALETTE", () => {
      it("should open QuickOpen in command mode", () => {
        const command = registeredCommands.get(
          ApplicationCommands.VIEW_SHOW_COMMAND_PALETTE,
        )!;
        const mockContext = commandContext({
          setQuickOpenInitialValue: vi.fn(),
          setIsQuickOpenOpen: vi.fn(),
        });

        command.run(mockContext);

        expect(mockContext.setQuickOpenInitialValue).toHaveBeenCalledWith(">");
        expect(mockContext.setIsQuickOpenOpen).toHaveBeenCalledWith(true);
      });
    });

    describe("VIEW_RESET_LAYOUT", () => {
      it("should call handleResetLayout handler with tab ID", () => {
        const command = registeredCommands.get(
          ApplicationCommands.VIEW_RESET_LAYOUT,
        )!;
        const mockContext = commandContext({
          activeTab: { id: "tab-123" },
        });

        command.run(mockContext);

        expect(handlers.handleResetLayout).toHaveBeenCalledWith("tab-123");
      });
    });

    describe("WORKSPACE_SAVE", () => {
      it("should call handleSaveWorkspace handler", () => {
        const command = registeredCommands.get(
          ApplicationCommands.WORKSPACE_SAVE,
        )!;
        const mockContext = commandContext({
          activeTab: { id: "tab-123" },
          setShowCreateWorkspaceDialog: vi.fn(),
        });

        command.run(mockContext);

        expect(handlers.handleSaveWorkspace).toHaveBeenCalledWith(
          "tab-123",
          mockContext.setShowCreateWorkspaceDialog,
        );
      });
    });

    describe("WORKSPACE_RENAME", () => {
      it("should call handleRenameWorkspace when workspace name exists", () => {
        const command = registeredCommands.get(
          ApplicationCommands.WORKSPACE_RENAME,
        )!;
        const mockContext = commandContext({
          workspaceName: "my-workspace",
          setShowRenameWorkspaceDialog: vi.fn(),
        });

        command.run(mockContext);

        expect(handlers.handleRenameWorkspace).toHaveBeenCalledWith(
          mockContext.setShowRenameWorkspaceDialog,
        );
      });

      it("should not call handler when workspace name is undefined", () => {
        const command = registeredCommands.get(
          ApplicationCommands.WORKSPACE_RENAME,
        )!;
        const mockContext = commandContext({
          workspaceName: null,
          setShowRenameWorkspaceDialog: vi.fn(),
        });

        command.run(mockContext);

        expect(handlers.handleRenameWorkspace).not.toHaveBeenCalled();
      });
    });

    describe("WORKSPACE_CLOSE", () => {
      it("should call handleCloseWorkspace when workspace name exists", () => {
        const command = registeredCommands.get(
          ApplicationCommands.WORKSPACE_CLOSE,
        )!;
        const mockContext = commandContext({
          workspaceName: "my-workspace",
        });

        command.run(mockContext);

        expect(handlers.handleCloseWorkspace).toHaveBeenCalled();
      });
    });

    describe("WORKSPACE_OPEN", () => {
      it("should call handleOpenWorkspace handler", () => {
        const command = registeredCommands.get(
          ApplicationCommands.WORKSPACE_OPEN,
        )!;
        const mockContext = commandContext({
          setShowWorkspacePicker: vi.fn(),
        });

        command.run(mockContext);

        expect(handlers.handleOpenWorkspace).toHaveBeenCalledWith(
          mockContext.setShowWorkspacePicker,
        );
      });
    });

    describe("WORKSPACE_OPEN_LAST", () => {
      it("should call handleOpenLastWorkspace handler", () => {
        const command = registeredCommands.get(
          ApplicationCommands.WORKSPACE_OPEN_LAST,
        )!;
        const mockContext = commandContext();

        command.run(mockContext);

        expect(handlers.handleOpenLastWorkspace).toHaveBeenCalled();
      });
    });

    describe("PANE_OPEN_WEB_PAGE", () => {
      it("should call handleOpenWebPage handler", () => {
        const command = registeredCommands.get(
          ApplicationCommands.PANE_OPEN_WEB_PAGE,
        )!;
        const mockContext = commandContext({
          setIsUrlDialogOpen: vi.fn(),
        });

        command.run(mockContext);

        expect(handlers.handleOpenWebPage).toHaveBeenCalledWith(
          mockContext.setIsUrlDialogOpen,
        );
      });
    });
  });

  // Editors keep Cmd+Arrow for moving the cursor, so pane navigation also
  // takes Cmd+Option+Arrow, which reaches the app from every pane type.
  describe("pane navigation keys", () => {
    it.each([
      ["ArrowLeft", "left"],
      ["ArrowRight", "right"],
      ["ArrowUp", "up"],
      ["ArrowDown", "down"],
    ])("Cmd+Option+%s moves focus to the pane %s", async (key, direction) => {
      const contextKeys = new ContextKeyService();
      contextKeys.setGlobal(hasActivePane.key, true);
      const keybindings = new KeybindingRegistry();
      const registry = new CommandRegistry(contextKeys, keybindings);
      registry.setContextBuilder(() =>
        commandContext({
          contextKeys,
          activeTab: { id: "tab-1" } as Tab,
          activePaneId: "pane-1",
        }),
      );
      registerApplicationCommands(registry);
      renderHook(() => useKeybindingDispatch(registry, keybindings));

      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          metaKey: true,
          altKey: true,
          bubbles: true,
        }),
      );
      await Promise.resolve();

      expect(navigatePane).toHaveBeenCalledWith("tab-1", "pane-1", direction);
    });
  });

  // Only the tab and pane menus set hasGitRepo, so the shortcut can't wait on it
  it("duplicates the tab into a worktree with Cmd+Option+W before any menu opens", async () => {
    vi.mocked(tabActions.duplicateTabIntoWorktree).mockResolvedValue({
      tabId: "tab-2",
      sessionId: "session-2",
      branchName: "worktree-branch",
    });
    const contextKeys = new ContextKeyService();
    const keybindings = new KeybindingRegistry();
    const registry = new CommandRegistry(contextKeys, keybindings);
    registry.setContextBuilder(() =>
      commandContext({ contextKeys, activeTab: { id: "tab-1" } as Tab }),
    );
    registerApplicationCommands(registry);
    renderHook(() => useKeybindingDispatch(registry, keybindings));

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "w",
        metaKey: true,
        altKey: true,
        bubbles: true,
      }),
    );
    await Promise.resolve();

    expect(tabActions.duplicateTabIntoWorktree).toHaveBeenCalledWith("tab-1");
  });
});
