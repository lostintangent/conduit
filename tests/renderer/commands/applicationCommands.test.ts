import {
  ApplicationCommands,
  registerApplicationCommands,
} from "@/commands/applicationCommands";
import type { ICommandRegistry } from "@/commands/core/CommandRegistry";
import type { CommandContext, CommandDescriptor } from "@/commands/core/types";
import * as handlers from "@/commands/handlers";
import * as focusModeActions from "@/store/actions/focusMode";
import * as tabActions from "@/store/actions/tab";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock store actions
vi.mock("@/store/actions/focusMode");
vi.mock("@/store/actions/tab");
vi.mock("@/commands/handlers");

describe("applicationCommands", () => {
  let mockRegistry: ICommandRegistry;
  let registeredCommands: Map<string, CommandDescriptor>;

  beforeEach(() => {
    vi.clearAllMocks();
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
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("registerApplicationCommands", () => {
    it("should register all commands", () => {
      registerApplicationCommands(mockRegistry);

      expect(mockRegistry.registerCommand).toHaveBeenCalledTimes(20);

      // View commands
      expect(
        registeredCommands.has(ApplicationCommands.VIEW_TOGGLE_FOCUS_MODE)
      ).toBe(true);
      expect(
        registeredCommands.has(ApplicationCommands.VIEW_TOGGLE_DESIGN_MODE)
      ).toBe(true);
      expect(
        registeredCommands.has(ApplicationCommands.VIEW_OPEN_KEYBOARD_SHORTCUTS)
      ).toBe(true);
      expect(
        registeredCommands.has(ApplicationCommands.VIEW_OPEN_PANE_ACTIONS)
      ).toBe(true);
      expect(
        registeredCommands.has(ApplicationCommands.VIEW_SHOW_COMMAND_PALETTE)
      ).toBe(true);
      expect(
        registeredCommands.has(ApplicationCommands.VIEW_RESET_LAYOUT)
      ).toBe(true);

      // Tab commands
      expect(registeredCommands.has(ApplicationCommands.TAB_NEW)).toBe(true);
      expect(registeredCommands.has(ApplicationCommands.TAB_CLOSE)).toBe(true);

      // Workspace commands
      expect(registeredCommands.has(ApplicationCommands.WORKSPACE_SAVE)).toBe(
        true
      );
      expect(registeredCommands.has(ApplicationCommands.WORKSPACE_RENAME)).toBe(
        true
      );
      expect(
        registeredCommands.has(ApplicationCommands.WORKSPACE_DUPLICATE)
      ).toBe(true);
      expect(registeredCommands.has(ApplicationCommands.WORKSPACE_CLOSE)).toBe(
        true
      );
      expect(registeredCommands.has(ApplicationCommands.WORKSPACE_OPEN)).toBe(
        true
      );
      expect(
        registeredCommands.has(ApplicationCommands.WORKSPACE_OPEN_LAST)
      ).toBe(true);

      // Pane commands
      expect(
        registeredCommands.has(ApplicationCommands.PANE_OPEN_WEB_PAGE)
      ).toBe(true);

      // Terminal commands
      expect(
        registeredCommands.has(ApplicationCommands.TERMINAL_CREATE_CLOUD)
      ).toBe(true);
      expect(
        registeredCommands.has(ApplicationCommands.TERMINAL_OPEN_IN_VSCODE)
      ).toBe(true);

      // Agent commands
      expect(
        registeredCommands.has(ApplicationCommands.AGENT_MANAGE_SESSIONS)
      ).toBe(true);
      expect(
        registeredCommands.has(ApplicationCommands.AGENT_MERGE_AND_CLOSE)
      ).toBe(true);
      expect(registeredCommands.has(ApplicationCommands.AGENT_TERMINATE)).toBe(
        true
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
        cmd.id.startsWith("view.")
      );
      viewCommands.forEach((command) => {
        expect(command.category).toBe("View");
      });

      // Tab commands
      const tabCommands = allCommands.filter((cmd) =>
        cmd.id.startsWith("tab.")
      );
      tabCommands.forEach((command) => {
        expect(command.category).toBe("Tab");
      });

      // Workspace commands
      const workspaceCommands = allCommands.filter((cmd) =>
        cmd.id.startsWith("workspace.")
      );
      workspaceCommands.forEach((command) => {
        expect(command.category).toBe("Workspace");
      });

      // Pane commands
      const paneCommands = allCommands.filter((cmd) =>
        cmd.id.startsWith("pane.")
      );
      paneCommands.forEach((command) => {
        expect(command.category).toBe("Pane");
      });

      // Terminal commands
      const terminalCommands = allCommands.filter((cmd) =>
        cmd.id.startsWith("terminal.")
      );
      terminalCommands.forEach((command) => {
        expect(command.category).toBe("Terminal");
      });

      // Agent commands
      const agentCommands = allCommands.filter((cmd) =>
        cmd.id.startsWith("agent.")
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
        ApplicationCommands.VIEW_OPEN_KEYBOARD_SHORTCUTS,
        ApplicationCommands.VIEW_SHOW_COMMAND_PALETTE,
        ApplicationCommands.WORKSPACE_SAVE,
        ApplicationCommands.WORKSPACE_RENAME,
        ApplicationCommands.WORKSPACE_CLOSE,
        ApplicationCommands.TAB_NEW,
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
          ApplicationCommands.VIEW_TOGGLE_FOCUS_MODE
        )!;
        const mockContext: CommandContext = {
          activeTab: {
            id: "tab-123",
            activePaneId: "pane-456",
          },
          activePaneId: "pane-456",
          workspaceName: undefined,
          allTabs: [],
          view: null as any,
          workspace: null as any,
          panes: null as any,
          agent: null as any,
          tabs: null as any,
          terminals: null as any,
          workspaces: null as any,
          commands: null as any,
          dialogs: null as any,
          notifications: null as any,
          settings: null as any,
          contextKeys: null as any,
        };

        command.run(mockContext);

        expect(focusModeActions.toggleFocusMode).toHaveBeenCalledWith(
          "tab-123",
          "pane-456"
        );
      });

      it("should not call toggleFocusMode when activeTab is null", () => {
        const command = registeredCommands.get(
          ApplicationCommands.VIEW_TOGGLE_FOCUS_MODE
        )!;
        const mockContext: CommandContext = {
          activeTab: null,
          activePaneId: null,
          workspaceName: undefined,
          allTabs: [],
          view: null as any,
          workspace: null as any,
          panes: null as any,
          agent: null as any,
          tabs: null as any,
          terminals: null as any,
          workspaces: null as any,
          commands: null as any,
          dialogs: null as any,
          notifications: null as any,
          settings: null as any,
          contextKeys: null as any,
        };

        command.run(mockContext);

        expect(focusModeActions.toggleFocusMode).not.toHaveBeenCalled();
      });
    });

    describe("TAB_NEW", () => {
      it("should call openTab action", () => {
        const command = registeredCommands.get(ApplicationCommands.TAB_NEW)!;
        const mockContext: CommandContext = {} as any;

        command.run(mockContext);

        expect(tabActions.openTab).toHaveBeenCalled();
      });
    });

    describe("TAB_CLOSE", () => {
      it("should call closeTab action with activeTab id", () => {
        const command = registeredCommands.get(ApplicationCommands.TAB_CLOSE)!;
        const mockContext: CommandContext = {
          activeTab: { id: "tab-123" },
        } as any;

        command.run(mockContext);

        expect(tabActions.closeTab).toHaveBeenCalledWith("tab-123");
      });

      it("should not call closeTab when activeTab is null", () => {
        const command = registeredCommands.get(ApplicationCommands.TAB_CLOSE)!;
        const mockContext: CommandContext = {
          activeTab: null,
        } as any;

        command.run(mockContext);

        expect(tabActions.closeTab).not.toHaveBeenCalled();
      });
    });

    describe("TERMINAL_CREATE_VM", () => {
      it("should call handleCreateVM handler", () => {
        const command = registeredCommands.get(
          ApplicationCommands.TERMINAL_CREATE_CLOUD
        )!;
        const mockContext: CommandContext = {} as any;

        command.run(mockContext);

        expect(handlers.handleCreateVM).toHaveBeenCalled();
      });
    });

    describe("TERMINAL_OPEN_IN_VSCODE", () => {
      it("should call handleOpenInVSCode handler with activeTab", () => {
        const command = registeredCommands.get(
          ApplicationCommands.TERMINAL_OPEN_IN_VSCODE
        )!;
        const mockActiveTab = { id: "tab-123" };
        const mockContext: CommandContext = {
          activeTab: mockActiveTab,
        } as any;

        command.run(mockContext);

        expect(handlers.handleOpenInVSCode).toHaveBeenCalledWith(mockActiveTab);
      });
    });

    describe("AGENT_MANAGE_SESSIONS", () => {
      it("should call handleManageSessions handler with context", () => {
        const command = registeredCommands.get(
          ApplicationCommands.AGENT_MANAGE_SESSIONS
        )!;
        const mockContext: CommandContext = {
          agent: {
            showManageSessionsDialog: vi.fn(),
          },
        } as any;

        command.run(mockContext);

        expect(handlers.handleManageSessions).toHaveBeenCalledWith(mockContext);
      });
    });

    describe("AGENT_MERGE_AND_CLOSE", () => {
      it("should call handleMergeAndClose handler with activeTab", () => {
        const command = registeredCommands.get(
          ApplicationCommands.AGENT_MERGE_AND_CLOSE
        )!;
        const mockActiveTab = { id: "tab-123" };
        const mockContext: CommandContext = {
          activeTab: mockActiveTab,
        } as any;

        command.run(mockContext);

        expect(handlers.handleMergeAndClose).toHaveBeenCalledWith(
          mockActiveTab
        );
      });
    });

    describe("AGENT_TERMINATE", () => {
      it("should call handleTerminate handler with activeTab", () => {
        const command = registeredCommands.get(
          ApplicationCommands.AGENT_TERMINATE
        )!;
        const mockActiveTab = { id: "tab-123" };
        const mockContext: CommandContext = {
          activeTab: mockActiveTab,
        } as any;

        command.run(mockContext);

        expect(handlers.handleTerminate).toHaveBeenCalledWith(mockActiveTab);
      });
    });

    describe("VIEW_TOGGLE_DESIGN_MODE", () => {
      it("should call handleToggleDesignMode handler", () => {
        const command = registeredCommands.get(
          ApplicationCommands.VIEW_TOGGLE_DESIGN_MODE
        )!;
        const mockContext: CommandContext = {
          applicationMode: "normal",
          setApplicationMode: vi.fn(),
        } as any;

        command.run(mockContext);

        expect(handlers.handleToggleDesignMode).toHaveBeenCalledWith(
          "normal",
          mockContext.setApplicationMode
        );
      });
    });

    describe("VIEW_OPEN_KEYBOARD_SHORTCUTS", () => {
      it("should call handleOpenKeyboardShortcuts handler", () => {
        const command = registeredCommands.get(
          ApplicationCommands.VIEW_OPEN_KEYBOARD_SHORTCUTS
        )!;
        const mockContext: CommandContext = {
          setShowKeybindingsEditor: vi.fn(),
        } as any;

        command.run(mockContext);

        expect(handlers.handleOpenKeyboardShortcuts).toHaveBeenCalledWith(
          mockContext.setShowKeybindingsEditor
        );
      });
    });

    describe("VIEW_SHOW_COMMAND_PALETTE", () => {
      it("should call handleShowCommandPalette handler", () => {
        const command = registeredCommands.get(
          ApplicationCommands.VIEW_SHOW_COMMAND_PALETTE
        )!;
        const mockContext: CommandContext = {
          setIsCommandPaletteOpenOverride: vi.fn(),
        } as any;

        command.run(mockContext);

        expect(handlers.handleShowCommandPalette).toHaveBeenCalledWith(
          mockContext.setIsCommandPaletteOpenOverride
        );
      });
    });

    describe("VIEW_RESET_LAYOUT", () => {
      it("should call handleResetLayout handler with tab ID", () => {
        const command = registeredCommands.get(
          ApplicationCommands.VIEW_RESET_LAYOUT
        )!;
        const mockContext: CommandContext = {
          activeTab: { id: "tab-123" },
        } as any;

        command.run(mockContext);

        expect(handlers.handleResetLayout).toHaveBeenCalledWith("tab-123");
      });
    });

    describe("WORKSPACE_SAVE", () => {
      it("should call handleSaveWorkspace handler", () => {
        const command = registeredCommands.get(
          ApplicationCommands.WORKSPACE_SAVE
        )!;
        const mockContext: CommandContext = {
          activeTab: { id: "tab-123" },
          allTabs: [{ id: "tab-123" }],
          setShowCreateWorkspaceDialog: vi.fn(),
        } as any;

        command.run(mockContext);

        expect(handlers.handleSaveWorkspace).toHaveBeenCalledWith(
          mockContext.allTabs,
          "tab-123",
          mockContext.setShowCreateWorkspaceDialog
        );
      });
    });

    describe("WORKSPACE_RENAME", () => {
      it("should call handleRenameWorkspace when workspace name exists", () => {
        const command = registeredCommands.get(
          ApplicationCommands.WORKSPACE_RENAME
        )!;
        const mockContext: CommandContext = {
          workspaceName: "my-workspace",
          setShowRenameWorkspaceDialog: vi.fn(),
        } as any;

        command.run(mockContext);

        expect(handlers.handleRenameWorkspace).toHaveBeenCalledWith(
          mockContext.setShowRenameWorkspaceDialog
        );
      });

      it("should not call handler when workspace name is undefined", () => {
        const command = registeredCommands.get(
          ApplicationCommands.WORKSPACE_RENAME
        )!;
        const mockContext: CommandContext = {
          workspaceName: undefined,
          setShowRenameWorkspaceDialog: vi.fn(),
        } as any;

        command.run(mockContext);

        expect(handlers.handleRenameWorkspace).not.toHaveBeenCalled();
      });
    });

    describe("WORKSPACE_CLOSE", () => {
      it("should call handleCloseWorkspace when workspace name exists", () => {
        const command = registeredCommands.get(
          ApplicationCommands.WORKSPACE_CLOSE
        )!;
        const mockContext: CommandContext = {
          workspaceName: "my-workspace",
        } as any;

        command.run(mockContext);

        expect(handlers.handleCloseWorkspace).toHaveBeenCalled();
      });
    });

    describe("WORKSPACE_OPEN", () => {
      it("should call handleOpenWorkspace handler", () => {
        const command = registeredCommands.get(
          ApplicationCommands.WORKSPACE_OPEN
        )!;
        const mockContext: CommandContext = {
          setShowWorkspacePicker: vi.fn(),
        } as any;

        command.run(mockContext);

        expect(handlers.handleOpenWorkspace).toHaveBeenCalledWith(
          mockContext.setShowWorkspacePicker
        );
      });
    });

    describe("WORKSPACE_OPEN_LAST", () => {
      it("should call handleOpenLastWorkspace handler", () => {
        const command = registeredCommands.get(
          ApplicationCommands.WORKSPACE_OPEN_LAST
        )!;
        const mockContext: CommandContext = {} as any;

        command.run(mockContext);

        expect(handlers.handleOpenLastWorkspace).toHaveBeenCalled();
      });
    });

    describe("PANE_OPEN_WEB_PAGE", () => {
      it("should call handleOpenWebPage handler", () => {
        const command = registeredCommands.get(
          ApplicationCommands.PANE_OPEN_WEB_PAGE
        )!;
        const mockContext: CommandContext = {
          setIsUrlDialogOpen: vi.fn(),
        } as any;

        command.run(mockContext);

        expect(handlers.handleOpenWebPage).toHaveBeenCalledWith(
          mockContext.setIsUrlDialogOpen
        );
      });
    });
  });
});
