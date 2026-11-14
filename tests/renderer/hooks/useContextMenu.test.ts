import { MenuId } from "@/commands/menus/types";
import { ApplicationCommands } from "@shared/commands";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted to define mocks that can be used in vi.mock
const {
  mockApi,
  mockMenuRegistry,
  mockContextKeyService,
  mockCommandRegistry,
  mockKeybindingRegistry,
} = vi.hoisted(() => {
  const api = {
    showContextMenu: vi.fn(),
    onContextMenuCommand: vi.fn(() => vi.fn()),
    hasGitRepository: vi.fn(),
  };

  const menuRegistry = {
    getSortedMenuItems: vi.fn(() => []),
  };

  const contextKeyService = {
    setGlobal: vi.fn(),
    getAll: vi.fn(() => ({})),
    onDidChangeContext: vi.fn(() => () => {}),
  };

  const commandRegistry = {
    getCommand: vi.fn((id) => ({
      id,
      title: `Command ${id}`,
      run: vi.fn(),
    })),
    registerCommand: vi.fn(),
    executeCommand: vi.fn(),
    getAllCommands: vi.fn(() => []),
    hasCommand: vi.fn(() => true),
    setContextBuilder: vi.fn(),
  };

  const keybindingRegistry = {
    getKeybindingsForCommand: vi.fn(() => []),
    registerKeybinding: vi.fn(),
    getAllKeybindings: vi.fn(() => []),
    handleKeyEvent: vi.fn(),
  };

  // Set up window.conduit before any modules load
  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).window.conduit = api;

  return {
    mockApi: api,
    mockMenuRegistry: menuRegistry,
    mockContextKeyService: contextKeyService,
    mockCommandRegistry: commandRegistry,
    mockKeybindingRegistry: keybindingRegistry,
  };
});

vi.mock("@/commands", () => ({
  getMenuRegistry: () => mockMenuRegistry,
  getContextKeyService: () => mockContextKeyService,
  getCommandRegistry: () => mockCommandRegistry,
  getKeybindingRegistry: () => mockKeybindingRegistry,
  executeCommand: vi.fn(),
}));

vi.mock("@/commands/menus/menuContextBuilders", () => ({
  getMenuContextBuilder: vi.fn(),
}));

import { getMenuContextBuilder } from "@/commands/menus/menuContextBuilders";
import { useContextMenu } from "@/hooks/useContextMenu";
import { tabsAtom } from "@/store/atoms";

describe("useContextMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Ensure window.conduit is available
    if (!(globalThis as any).window) {
      (globalThis as any).window = {};
    }
    (globalThis as any).window.conduit = mockApi;

    // Default mock for tabs
    tabsAtom.set([
      {
        id: "tab-1",
        title: "Tab 1",
        activePaneId: "pane-1",
        panes: {
          "pane-1": { type: "terminal", cwd: "/repo" },
          "pane-2": { type: "browser", url: "https://example.com" },
        },
      },
    ] as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("handleContextMenu", () => {
    it("should call the appropriate context builder based on menu ID", async () => {
      const mockContextBuilder = vi.fn();
      (getMenuContextBuilder as any).mockReturnValue(mockContextBuilder);

      const { result } = renderHook(() =>
        useContextMenu({ canChangeTitle: () => true }),
      );

      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as any;

      await result.current(mockEvent, "tab-1", "pane-1");

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(getMenuContextBuilder).toHaveBeenCalledWith(MenuId.PaneContext);
      expect(mockContextBuilder).toHaveBeenCalled();
    });

    it("should use TabContext menu for tab context (no paneId)", async () => {
      const mockContextBuilder = vi.fn();
      (getMenuContextBuilder as any).mockReturnValue(mockContextBuilder);

      const { result } = renderHook(() =>
        useContextMenu({ canChangeTitle: () => true }),
      );

      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as any;

      await result.current(mockEvent, "tab-1");

      expect(getMenuContextBuilder).toHaveBeenCalledWith(MenuId.TabContext);
    });

    it("should use PaneContext menu for pane context (with paneId)", async () => {
      const mockContextBuilder = vi.fn();
      (getMenuContextBuilder as any).mockReturnValue(mockContextBuilder);

      const { result } = renderHook(() =>
        useContextMenu({ canChangeTitle: () => true }),
      );

      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as any;

      await result.current(mockEvent, "tab-1", "pane-1");

      expect(getMenuContextBuilder).toHaveBeenCalledWith(MenuId.PaneContext);
    });

    it("should filter menu items by when clauses", async () => {
      (getMenuContextBuilder as any).mockReturnValue(vi.fn());

      mockMenuRegistry.getSortedMenuItems.mockReturnValue([
        {
          commandId: "command.visible",
          group: "1_test",
          order: 1,
          when: { evaluate: () => true }, // Always visible
        },
        {
          commandId: "command.hidden",
          group: "1_test",
          order: 2,
          when: { evaluate: () => false }, // Hidden
        },
        {
          commandId: "command.noWhen",
          group: "1_test",
          order: 3,
          // No when clause - should be visible
        },
      ]);

      const { result } = renderHook(() =>
        useContextMenu({ canChangeTitle: () => true }),
      );

      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as any;

      await result.current(mockEvent, "tab-1");

      await waitFor(() => {
        expect(mockApi.showContextMenu).toHaveBeenCalled();
      });

      const callArgs = mockApi.showContextMenu.mock.calls[0][0];
      const menuItems = callArgs.menuItems;

      // Should only include visible items
      expect(menuItems).toHaveLength(2);
      expect(
        menuItems.some((item: any) => item.commandId === "command.visible"),
      ).toBe(true);
      expect(
        menuItems.some((item: any) => item.commandId === "command.noWhen"),
      ).toBe(true);
      expect(
        menuItems.some((item: any) => item.commandId === "command.hidden"),
      ).toBe(false);
    });

    it("should filter out rename tab command when not allowed", async () => {
      (getMenuContextBuilder as any).mockReturnValue(vi.fn());

      mockMenuRegistry.getSortedMenuItems.mockReturnValue([
        {
          commandId: ApplicationCommands.TAB_RENAME,
          group: "1_tab",
          order: 1,
        },
        {
          commandId: "other.command",
          group: "1_tab",
          order: 2,
        },
      ]);

      const { result } = renderHook(
        () => useContextMenu({ canChangeTitle: () => false }), // Not allowed
      );

      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as any;

      await result.current(mockEvent, "tab-1");

      await waitFor(() => {
        expect(mockApi.showContextMenu).toHaveBeenCalled();
      });

      const callArgs = mockApi.showContextMenu.mock.calls[0][0];
      const menuItems = callArgs.menuItems;

      // Should not include rename tab
      expect(
        menuItems.some(
          (item: any) => item.commandId === ApplicationCommands.TAB_RENAME,
        ),
      ).toBe(false);
      expect(
        menuItems.some((item: any) => item.commandId === "other.command"),
      ).toBe(true);
    });

    it("should include rename tab command when allowed", async () => {
      (getMenuContextBuilder as any).mockReturnValue(vi.fn());

      mockMenuRegistry.getSortedMenuItems.mockReturnValue([
        {
          commandId: ApplicationCommands.TAB_RENAME,
          group: "1_tab",
          order: 1,
        },
      ]);

      const { result } = renderHook(
        () => useContextMenu({ canChangeTitle: () => true }), // Allowed
      );

      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as any;

      await result.current(mockEvent, "tab-1");

      await waitFor(() => {
        expect(mockApi.showContextMenu).toHaveBeenCalled();
      });

      const callArgs = mockApi.showContextMenu.mock.calls[0][0];
      const menuItems = callArgs.menuItems;

      // Should include rename tab
      expect(
        menuItems.some(
          (item: any) => item.commandId === ApplicationCommands.TAB_RENAME,
        ),
      ).toBe(true);
    });

    it("should augment menu items with keybindings", async () => {
      (getMenuContextBuilder as any).mockReturnValue(vi.fn());

      mockMenuRegistry.getSortedMenuItems.mockReturnValue([
        {
          commandId: "command.test",
          group: "1_test",
          order: 1,
        },
      ]);

      mockKeybindingRegistry.getKeybindingsForCommand.mockReturnValue([
        {
          chords: [{ key: "Cmd+T" }],
        },
      ]);

      const { result } = renderHook(() =>
        useContextMenu({ canChangeTitle: () => true }),
      );

      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as any;

      await result.current(mockEvent, "tab-1");

      await waitFor(() => {
        expect(mockApi.showContextMenu).toHaveBeenCalled();
      });

      expect(
        mockKeybindingRegistry.getKeybindingsForCommand,
      ).toHaveBeenCalledWith("command.test");
    });

    it("should early return if tab not found", async () => {
      tabsAtom.set([]); // No tabs

      const { result } = renderHook(() =>
        useContextMenu({ canChangeTitle: () => true }),
      );

      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as any;

      await result.current(mockEvent, "tab-999");

      expect(mockApi.showContextMenu).not.toHaveBeenCalled();
    });

    it("should pass correct params to context builder", async () => {
      const mockContextBuilder = vi.fn();
      (getMenuContextBuilder as any).mockReturnValue(mockContextBuilder);

      const { result } = renderHook(() =>
        useContextMenu({ canChangeTitle: (id) => id === "tab-1" }),
      );

      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as any;

      await result.current(mockEvent, "tab-1", "pane-1");

      await waitFor(() => {
        expect(mockContextBuilder).toHaveBeenCalled();
      });

      const params = mockContextBuilder.mock.calls[0][1];
      expect(params.tabId).toBe("tab-1");
      expect(params.paneId).toBe("pane-1");
      expect(params.canChangeTitle).toBe(true);
      expect(params.tab).toBeDefined();
      expect(params.pane).toBeDefined();
    });
  });

  describe("git repository caching", () => {
    it("should cache git repository checks", async () => {
      mockApi.hasGitRepository.mockResolvedValue(true);

      const mockContextBuilder = vi.fn(async (_ctx, _params, checkGitRepo) => {
        await checkGitRepo("/repo");
      });

      (getMenuContextBuilder as any).mockReturnValue(mockContextBuilder);

      const { result } = renderHook(() =>
        useContextMenu({ canChangeTitle: () => true }),
      );

      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as any;

      // act() flushes the cache update and refreshes result.current, so the
      // second call sees the cache instead of racing a timer for it.
      await act(() => result.current(mockEvent, "tab-1", "pane-1"));
      await act(() => result.current(mockEvent, "tab-1", "pane-1"));

      expect(mockContextBuilder).toHaveBeenCalledTimes(2);
      expect(mockApi.hasGitRepository).toHaveBeenCalledTimes(1);
    });
  });
});
