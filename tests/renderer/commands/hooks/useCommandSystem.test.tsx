import { describe, it, expect, beforeEach, type Mock, vi } from "vitest";

// Mock window.conduit before importing modules that use it
// @ts-ignore
window.conduit = {};

import { renderHook, waitFor } from "@testing-library/react";
import {
  type UseCommandSystemOptions,
  useCommandSystem,
} from "@/commands/hooks/useCommandSystem";
import { keybindingsAtom } from "@/store/atoms";
import { ApplicationCommands } from "@/commands/applicationCommands";
import type { ApplicationMode } from "@/store/atoms";

describe("useCommandSystem", () => {
  let setApplicationModeMock: Mock<(mode: ApplicationMode) => void>;

  beforeEach(() => {
    keybindingsAtom.set(new Map());
    setApplicationModeMock = vi.fn();
  });

  function options(
    overrides: Partial<UseCommandSystemOptions> = {},
  ): UseCommandSystemOptions {
    return {
      activeTab: null,
      tabs: [],
      applicationMode: "normal",
      setApplicationMode: setApplicationModeMock,
      hasCustomLayout: () => false,
      hasLastWorkspace: false,
      setShowGeneralSettings: vi.fn(),
      setShowKeybindingsEditor: vi.fn(),
      setShowPaneActionsEditor: vi.fn(),
      setShowAgentsEditor: vi.fn(),
      setShowAgentLauncher: vi.fn(),
      setShowRenameWorkspaceDialog: vi.fn(),
      setShowWorkspacePicker: vi.fn(),
      setIsUrlDialogOpen: vi.fn(),
      setCleanupDialogSessions: vi.fn(),
      setShowCreateWorkspaceDialog: vi.fn(),
      setShowDuplicateWorkspaceDialog: vi.fn(),
      setShowDuplicateTabWithCwdDialog: vi.fn(),
      setTitleModal: vi.fn(),
      setIsQuickOpenOpen: vi.fn(),
      setQuickOpenInitialValue: vi.fn(),
      ...overrides,
    };
  }

  function renderCommandSystem(
    overrides: Partial<UseCommandSystemOptions> = {},
  ) {
    return renderHook(() => useCommandSystem(options(overrides)));
  }

  describe("initialization", () => {
    it("should initialize command system", async () => {
      const { result } = renderCommandSystem();

      // In test environment, effects run synchronously so system is ready immediately
      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });
    });

    it("should initialize and return command system state when ready", async () => {
      const { result } = renderCommandSystem();

      // Wait for initialization
      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      expect(result.current).toMatchObject({
        commandRegistry: expect.any(Object),
        keybindingRegistry: expect.any(Object),
        isReady: true,
      });
    });

    it("should have commandRegistry with methods", async () => {
      const { result } = renderCommandSystem();

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      const { commandRegistry } = result.current!;
      expect(commandRegistry.getCommand).toBeDefined();
      expect(commandRegistry.getAllCommands).toBeDefined();
      expect(commandRegistry.executeCommand).toBeDefined();
    });

    it("should have keybindingRegistry with methods", async () => {
      const { result } = renderCommandSystem();

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      const { keybindingRegistry } = result.current!;
      expect(keybindingRegistry.getAllKeybindings).toBeDefined();
      expect(keybindingRegistry.getKeybindingsForCommand).toBeDefined();
    });
  });

  describe("application commands registration", () => {
    it("should register application commands", async () => {
      const { result } = renderCommandSystem();

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      const { commandRegistry } = result.current!;

      // Check that application commands are registered
      const focusModeCommand = commandRegistry.getCommand(
        ApplicationCommands.VIEW_TOGGLE_FOCUS_MODE,
      );
      expect(focusModeCommand).toBeDefined();
      expect(focusModeCommand?.title).toBe("Toggle Focus Mode");

      const toggleControlsCommand = commandRegistry.getCommand(
        ApplicationCommands.VIEW_TOGGLE_DESIGN_MODE,
      );
      expect(toggleControlsCommand).toBeDefined();
      expect(toggleControlsCommand?.title).toBe("Toggle Design Mode");

      const keyboardShortcutsCommand = commandRegistry.getCommand(
        ApplicationCommands.VIEW_OPEN_KEYBINDINGS,
      );
      expect(keyboardShortcutsCommand).toBeDefined();
      expect(keyboardShortcutsCommand?.title).toBe("Keyboard Shortcuts");
    });

    it("should have keybindings for application commands", async () => {
      const { result } = renderCommandSystem();

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      const { keybindingRegistry } = result.current!;
      const focusModeBindings = keybindingRegistry.getKeybindingsForCommand(
        ApplicationCommands.VIEW_TOGGLE_FOCUS_MODE,
      );

      expect(focusModeBindings.length).toBeGreaterThan(0);
    });
  });

  describe("keybindings atom population", () => {
    it("should populate keybindings atom with initial bindings", async () => {
      renderCommandSystem();

      await waitFor(() => {
        const keybindings = keybindingsAtom.get();
        expect(keybindings.size).toBeGreaterThan(0);
      });
    });

    it("should include application command keybindings in atom", async () => {
      renderCommandSystem();

      await waitFor(() => {
        const keybindings = keybindingsAtom.get();
        expect(
          keybindings.has(ApplicationCommands.VIEW_TOGGLE_FOCUS_MODE),
        ).toBe(true);
        expect(
          keybindings.has(ApplicationCommands.VIEW_TOGGLE_DESIGN_MODE),
        ).toBe(true);
        expect(keybindings.has(ApplicationCommands.VIEW_OPEN_KEYBINDINGS)).toBe(
          true,
        );
      });
    });
  });

  describe("context builder", () => {
    it("should set context builder with view service", async () => {
      const { result } = renderCommandSystem();

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      const { commandRegistry } = result.current!;

      // Execute a command to test context builder
      const toggleCommand = commandRegistry.getCommand(
        ApplicationCommands.VIEW_TOGGLE_DESIGN_MODE,
      );
      expect(toggleCommand).toBeDefined();

      // Execute the command - should call setApplicationMode
      await commandRegistry.executeCommand(
        ApplicationCommands.VIEW_TOGGLE_DESIGN_MODE,
      );

      expect(setApplicationModeMock).toHaveBeenCalledWith("design");
    });

    it("should provide activeTab in context", async () => {
      const mockTab = {
        id: "tab-1",
        activePaneId: "pane-1",
        panes: {},
      };

      const { result } = renderCommandSystem({ activeTab: mockTab });

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      const { commandRegistry } = result.current!;

      // Register a test command that accesses activeTab
      let capturedContext: any = null;
      commandRegistry.registerCommand({
        id: "test.captureContext",
        title: "Capture Context",
        run: (context) => {
          capturedContext = context;
        },
      });

      await commandRegistry.executeCommand("test.captureContext");

      expect(capturedContext).toBeDefined();
      expect(capturedContext.activeTab).toEqual(mockTab);
      expect(capturedContext.activePaneId).toBe("pane-1");
    });

    it("should update context when applicationMode changes", async () => {
      const { result, rerender } = renderHook(
        ({ mode }) => useCommandSystem(options({ applicationMode: mode })),
        {
          initialProps: { mode: "normal" as ApplicationMode },
        },
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      // Change mode and rerender
      rerender({ mode: "design" as ApplicationMode });

      // Execute toggle command - should toggle back to normal
      await result.current!.commandRegistry.executeCommand(
        ApplicationCommands.VIEW_TOGGLE_DESIGN_MODE,
      );

      expect(setApplicationModeMock).toHaveBeenCalledWith("normal");
    });

    it("should update context when activeTab changes", async () => {
      const mockTab1 = { id: "tab-1", activePaneId: "pane-1", panes: {} };
      const mockTab2 = { id: "tab-2", activePaneId: "pane-2", panes: {} };

      const { result, rerender } = renderHook(
        ({ tab }) => useCommandSystem(options({ activeTab: tab })),
        {
          initialProps: { tab: mockTab1 },
        },
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      const { commandRegistry } = result.current!;

      // Register a test command
      let capturedTab: any = null;
      commandRegistry.registerCommand({
        id: "test.captureTab",
        title: "Capture Tab",
        run: (context) => {
          capturedTab = context.activeTab;
        },
      });

      // Execute with first tab
      await commandRegistry.executeCommand("test.captureTab");
      expect(capturedTab).toEqual(mockTab1);

      // Change tab
      rerender({ tab: mockTab2 });

      // Execute again with second tab
      await commandRegistry.executeCommand("test.captureTab");
      expect(capturedTab).toEqual(mockTab2);
    });
  });

  describe("ready state management", () => {
    it("should set context builder before returning system", async () => {
      const { result } = renderCommandSystem();

      // Wait for system to be ready
      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      // Context builder should be set when system is returned
      expect(result.current).toBeDefined();
    });

    it("should have isReady=true when returned", async () => {
      const { result } = renderCommandSystem();

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      expect(result.current!.isReady).toBe(true);
    });
  });

  describe("stability", () => {
    it("should not reinitialize on rerender", async () => {
      const { result, rerender } = renderCommandSystem();

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      const firstRegistry = result.current!.commandRegistry;

      rerender();

      expect(result.current!.commandRegistry).toBe(firstRegistry);
    });
  });

  describe("file watching", () => {
    it("should not watch keybindings file when homeDirectory is not provided", async () => {
      const mockSubscribe = vi.fn().mockResolvedValue("sub-1");
      const originalConduit = window.conduit;

      // Mock window.conduit.fs.subscribe
      window.conduit = {
        ...window.conduit,
        fs: {
          ...window.conduit?.fs,
          subscribe: mockSubscribe,
          unsubscribe: vi.fn(),
          onFileContentChanged: vi.fn(() => () => {}),
          readTextFile: vi.fn().mockResolvedValue("[]"),
        },
      } as unknown as typeof window.conduit;

      renderCommandSystem();

      await waitFor(() => {
        // Give time for effects to run
      });

      expect(mockSubscribe).not.toHaveBeenCalled();

      // Restore
      window.conduit = originalConduit;
    });

    it("should watch keybindings file when homeDirectory is provided", async () => {
      const mockUnsubscribe = vi.fn();
      const mockSubscribe = vi.fn().mockResolvedValue("sub-1");
      const originalConduit = window.conduit;

      // Mock window.conduit.fs
      window.conduit = {
        ...window.conduit,
        fs: {
          ...window.conduit?.fs,
          subscribe: mockSubscribe,
          unsubscribe: mockUnsubscribe,
          onFileContentChanged: vi.fn(() => () => {}),
          readTextFile: vi.fn().mockResolvedValue("[]"),
        },
      } as unknown as typeof window.conduit;

      const { unmount } = renderCommandSystem({ homeDirectory: "/test/home" });

      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalledWith(
          "/test/home/.conduit",
          "file",
          "/test/home/.conduit/keybindings.json",
        );
      });

      // Cleanup should unsubscribe
      unmount();
      await waitFor(() => {
        expect(mockUnsubscribe).toHaveBeenCalledWith("sub-1");
      });

      // Restore
      window.conduit = originalConduit;
    });

    it("should handle file changes and reload keybindings", async () => {
      let fileChangedListener = null as
        ((payload: { subscriptionId: string; path: string }) => void) | null;
      const mockUnsubscribe = vi.fn();
      const mockSubscribe = vi.fn().mockResolvedValue("sub-1");
      const mockOnFileContentChanged = vi.fn(
        (
          callback: (payload: { subscriptionId: string; path: string }) => void,
        ) => {
          fileChangedListener = callback;
          return () => {};
        },
      );
      const originalConduit = window.conduit;
      const mockReadTextFile = vi.fn().mockResolvedValue("[]");

      // Mock window.conduit.fs
      window.conduit = {
        ...window.conduit,
        fs: {
          ...window.conduit?.fs,
          subscribe: mockSubscribe,
          unsubscribe: mockUnsubscribe,
          onFileContentChanged: mockOnFileContentChanged,
          readTextFile: mockReadTextFile,
        },
      } as unknown as typeof window.conduit;

      const { result } = renderCommandSystem({ homeDirectory: "/test/home" });

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      // Wait for subscription to be set up
      await waitFor(() => {
        expect(fileChangedListener).not.toBeNull();
      });

      // Trigger file change
      if (fileChangedListener) {
        fileChangedListener({
          subscriptionId: "sub-1",
          path: "/test/home/.conduit/keybindings.json",
        });
      }

      // Should have attempted to read the file
      await waitFor(() => {
        expect(mockReadTextFile).toHaveBeenCalledWith(
          "/test/home/.conduit",
          "/test/home/.conduit/keybindings.json",
        );
      });

      // Restore
      window.conduit = originalConduit;
    });
  });
});
