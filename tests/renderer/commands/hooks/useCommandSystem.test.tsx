import { describe, it, expect, beforeEach, type Mock, vi } from "vitest";

// Mock window.conduit before importing modules that use it
// @ts-ignore
window.conduit = {};

import { act, renderHook, waitFor } from "@testing-library/react";
import {
  type UseCommandSystemOptions,
  useCommandSystem,
} from "@/commands/hooks/useCommandSystem";
import { activeTabIdAtom, keybindingsAtom, tabsAtom } from "@/store/atoms";
import type { Tab } from "@/types";
import { ApplicationCommands } from "@/commands/applicationCommands";
import type { ApplicationMode } from "@/store/atoms";

describe("useCommandSystem", () => {
  let setApplicationModeMock: Mock<(mode: ApplicationMode) => void>;

  beforeEach(() => {
    keybindingsAtom.set(new Map());
    tabsAtom.set([]);
    activeTabIdAtom.set(null);
    setApplicationModeMock = vi.fn();
  });

  function terminalTab(id: string): Tab {
    return {
      id,
      panes: {
        [`${id}-pane`]: {
          id: `${id}-pane`,
          type: "terminal",
          sessionId: `${id}-session`,
          cwd: "/repo",
        },
      },
      layout: { id: `${id}-node`, type: "pane", paneId: `${id}-pane` },
      activePaneId: `${id}-pane`,
    };
  }

  function options(
    overrides: Partial<UseCommandSystemOptions> = {},
  ): UseCommandSystemOptions {
    return {
      applicationMode: "normal",
      setApplicationMode: setApplicationModeMock,
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
      const mockTab = terminalTab("tab-1");
      tabsAtom.set([mockTab]);
      activeTabIdAtom.set("tab-1");

      const { result } = renderCommandSystem();

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
      expect(capturedContext.activePaneId).toBe("tab-1-pane");
      expect(capturedContext.allTabs).toEqual([mockTab]);
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

    it("should give commands the active tab as it is when they run", async () => {
      const mockTab1 = terminalTab("tab-1");
      const mockTab2 = terminalTab("tab-2");
      tabsAtom.set([mockTab1, mockTab2]);
      activeTabIdAtom.set("tab-1");

      const { result } = renderCommandSystem();

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

      // Switch tabs, and run before anything re-renders
      activeTabIdAtom.set("tab-2");
      await commandRegistry.executeCommand("test.captureTab");
      expect(capturedTab).toEqual(mockTab2);
    });
  });

  describe("context keys", () => {
    it("follow the active pane and its tab's layout", async () => {
      const tab = terminalTab("tab-1");
      tabsAtom.set([tab]);
      activeTabIdAtom.set("tab-1");
      const { result } = renderCommandSystem();
      await waitFor(() => expect(result.current).not.toBeNull());
      const keys = () => result.current!.contextKeyService.getAll();

      expect(keys()).toMatchObject({
        tabCount: 1,
        hasActivePane: true,
        activePaneType: "terminal",
        hasCwd: true,
        hasCustomLayout: false,
        paneCanBeCollapsed: false,
      });

      act(() =>
        tabsAtom.set([
          {
            ...tab,
            panes: {
              ...tab.panes,
              editor: { id: "editor", type: "editor", cwd: "/repo" },
            },
            layout: {
              id: "split",
              type: "split",
              direction: "row",
              children: [
                { ...tab.layout, size: 30 },
                { id: "editor-node", type: "pane", paneId: "editor" },
              ],
            },
            activePaneId: "editor",
          },
          terminalTab("tab-2"),
        ]),
      );

      expect(keys()).toMatchObject({
        tabCount: 2,
        activePaneType: "editor",
        hasCwd: false,
        hasCustomLayout: true,
        paneCanBeCollapsed: true,
      });

      act(() => activeTabIdAtom.set(null));

      expect(keys()).toMatchObject({
        hasActivePane: false,
        activePaneType: "",
        hasCustomLayout: false,
      });
    });

    it("go back to the active pane's after a context menu sets them for another", async () => {
      const tab = terminalTab("tab-1");
      const twoPanes = (collapsed: boolean, activePaneId: string): Tab => ({
        ...tab,
        panes: {
          ...tab.panes,
          other: { ...tab.panes["tab-1-pane"], id: "other" },
        },
        layout: {
          id: "split",
          type: "split",
          direction: "row",
          children: [
            tab.layout,
            { id: "other-node", type: "pane", paneId: "other", collapsed },
          ],
        },
        activePaneId,
      });
      tabsAtom.set([twoPanes(true, "tab-1-pane")]);
      activeTabIdAtom.set("tab-1");
      const { result } = renderCommandSystem();
      await waitFor(() => expect(result.current).not.toBeNull());
      const service = result.current!.contextKeyService;

      // What the pane menu sets on right-clicking the collapsed pane
      service.setGlobal("paneIsCollapsed", true);
      service.setGlobal("tabIsLocked", true);
      // Expanding it makes it active, a pane like the one before
      act(() => tabsAtom.set([twoPanes(false, "other")]));

      expect(service.getAll()).toMatchObject({
        paneIsCollapsed: false,
        tabIsLocked: false,
      });
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

      // Mock window.conduit.files.subscribe
      window.conduit = {
        ...window.conduit,
        files: {
          ...window.conduit?.files,
          subscribe: mockSubscribe,
          unsubscribe: vi.fn(),
          on: vi.fn(() => () => {}),
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

      // Mock window.conduit.files
      window.conduit = {
        ...window.conduit,
        files: {
          ...window.conduit?.files,
          subscribe: mockSubscribe,
          unsubscribe: mockUnsubscribe,
          on: vi.fn(() => () => {}),
          readTextFile: vi.fn().mockResolvedValue("[]"),
        },
      } as unknown as typeof window.conduit;

      const { unmount } = renderCommandSystem({ homeDirectory: "/test/home" });

      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalledWith(
          "/test/home/.conduit",
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
      const mockOn = vi.fn(
        (
          event: string,
          callback: (payload: { subscriptionId: string; path: string }) => void,
        ) => {
          if (event === "fileContentChanged") fileChangedListener = callback;
          return () => {};
        },
      );
      const originalConduit = window.conduit;
      const mockReadTextFile = vi.fn().mockResolvedValue("[]");

      // Mock window.conduit.files
      window.conduit = {
        ...window.conduit,
        files: {
          ...window.conduit?.files,
          subscribe: mockSubscribe,
          unsubscribe: mockUnsubscribe,
          on: mockOn,
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
          "/test/home/.conduit/keybindings.json",
        );
      });

      // Restore
      window.conduit = originalConduit;
    });
  });
});
