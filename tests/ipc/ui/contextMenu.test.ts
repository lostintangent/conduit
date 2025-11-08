import { describe, it, expect, vi, beforeEach } from "vitest";
import { showContextMenu, type ContextMenuItemData } from "../../../src/ipc/ui/contextMenu";
import { BrowserWindow, Menu } from "electron";

// Mock Electron modules
vi.mock("electron", () => ({
  BrowserWindow: vi.fn(),
  Menu: {
    buildFromTemplate: vi.fn(),
  },
}));

describe("contextMenu", () => {
  let mockWindow: any;
  let mockMenu: any;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock menu
    mockMenu = {
      popup: vi.fn(),
    };
    (Menu.buildFromTemplate as any).mockReturnValue(mockMenu);

    // Setup mock window
    mockSend = vi.fn();
    mockWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: {
        send: mockSend,
      },
    };
  });

  describe("showContextMenu", () => {
    it("should early return if window is null", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "test.command",
          title: "Test Command",
          group: "1_test",
          enabled: true,
        },
      ];

      showContextMenu(null as any, {
        tabId: "tab-1",
        menuItems,
      });

      expect(Menu.buildFromTemplate).not.toHaveBeenCalled();
    });

    it("should early return if window is destroyed", () => {
      mockWindow.isDestroyed.mockReturnValue(true);

      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "test.command",
          title: "Test Command",
          group: "1_test",
          enabled: true,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      expect(Menu.buildFromTemplate).not.toHaveBeenCalled();
    });

    it("should build menu from menu items", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "test.command1",
          title: "Test Command 1",
          group: "1_test",
          enabled: true,
        },
        {
          commandId: "test.command2",
          title: "Test Command 2",
          group: "1_test",
          enabled: false,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      expect(Menu.buildFromTemplate).toHaveBeenCalledWith([
        {
          label: "Test Command 1",
          accelerator: undefined,
          enabled: true,
          click: expect.any(Function),
        },
        {
          label: "Test Command 2",
          accelerator: undefined,
          enabled: false,
          click: expect.any(Function),
        },
      ]);
      expect(mockMenu.popup).toHaveBeenCalled();
    });

    it("should group menu items by group property", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "command.a",
          title: "Command A",
          group: "1_first",
          enabled: true,
        },
        {
          commandId: "command.b",
          title: "Command B",
          group: "2_second",
          enabled: true,
        },
        {
          commandId: "command.c",
          title: "Command C",
          group: "1_first",
          enabled: true,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];

      // Should have: Command A, Command C, separator, Command B
      expect(template).toHaveLength(4);
      expect(template[0].label).toBe("Command A");
      expect(template[1].label).toBe("Command C");
      expect(template[2].type).toBe("separator");
      expect(template[3].label).toBe("Command B");
    });

    it("should sort groups alphabetically", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "command.a",
          title: "Command A",
          group: "3_third",
          enabled: true,
        },
        {
          commandId: "command.b",
          title: "Command B",
          group: "1_first",
          enabled: true,
        },
        {
          commandId: "command.c",
          title: "Command C",
          group: "2_second",
          enabled: true,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];

      // Groups should be sorted: 1_first, 2_second, 3_third
      expect(template[0].label).toBe("Command B"); // 1_first
      expect(template[1].type).toBe("separator");
      expect(template[2].label).toBe("Command C"); // 2_second
      expect(template[3].type).toBe("separator");
      expect(template[4].label).toBe("Command A"); // 3_third
    });

    it("should not add separator after last group", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "command.a",
          title: "Command A",
          group: "1_first",
          enabled: true,
        },
        {
          commandId: "command.b",
          title: "Command B",
          group: "2_second",
          enabled: true,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];

      // Should have: Command A, separator, Command B (no separator after)
      expect(template).toHaveLength(3);
      expect(template[2].type).not.toBe("separator");
    });

    it("should include keybindings as accelerators", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "test.command",
          title: "Test Command",
          group: "1_test",
          enabled: true,
          keybinding: "Cmd+T",
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];

      expect(template[0].accelerator).toBe("Cmd+T");
    });

    it("should send command to renderer when menu item clicked", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "test.command",
          title: "Test Command",
          group: "1_test",
          enabled: true,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        paneId: "pane-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];
      const clickHandler = template[0].click;

      // Simulate clicking the menu item
      clickHandler();

      expect(mockSend).toHaveBeenCalledWith("ui:context-menu-command", {
        commandId: "test.command",
        tabId: "tab-1",
        paneId: "pane-1",
        menuItems,
      });
    });

    it("should handle menu without paneId", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "test.command",
          title: "Test Command",
          group: "1_test",
          enabled: true,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];
      const clickHandler = template[0].click;

      clickHandler();

      expect(mockSend).toHaveBeenCalledWith("ui:context-menu-command", {
        commandId: "test.command",
        tabId: "tab-1",
        menuItems,
      });
    });

    it("should handle empty menu items array", () => {
      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems: [],
      });

      expect(Menu.buildFromTemplate).toHaveBeenCalledWith([]);
      expect(mockMenu.popup).toHaveBeenCalled();
    });

    it("should handle single menu item without separator", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "test.command",
          title: "Test Command",
          group: "1_test",
          enabled: true,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];

      expect(template).toHaveLength(1);
      expect(template[0].type).not.toBe("separator");
    });

    it("should preserve enabled/disabled state", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "enabled.command",
          title: "Enabled Command",
          group: "1_test",
          enabled: true,
        },
        {
          commandId: "disabled.command",
          title: "Disabled Command",
          group: "1_test",
          enabled: false,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];

      expect(template[0].enabled).toBe(true);
      expect(template[1].enabled).toBe(false);
    });

    it("should handle multiple items in same group without separators", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "command.a",
          title: "Command A",
          group: "1_test",
          enabled: true,
        },
        {
          commandId: "command.b",
          title: "Command B",
          group: "1_test",
          enabled: true,
        },
        {
          commandId: "command.c",
          title: "Command C",
          group: "1_test",
          enabled: true,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];

      // All items in same group - no separators
      expect(template).toHaveLength(3);
      expect(template.every((item: any) => item.type !== "separator")).toBe(true);
    });

    it("should handle menu items without keybindings", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "test.command",
          title: "Test Command",
          group: "1_test",
          enabled: true,
          // No keybinding property
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];

      expect(template[0].accelerator).toBeUndefined();
    });

    it("should send correct commandId for each menu item click", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "command.first",
          title: "First Command",
          group: "1_test",
          enabled: true,
        },
        {
          commandId: "command.second",
          title: "Second Command",
          group: "1_test",
          enabled: true,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];

      // Click first item
      template[0].click();
      expect(mockSend).toHaveBeenCalledWith("ui:context-menu-command", {
        commandId: "command.first",
        tabId: "tab-1",
        menuItems,
      });

      // Click second item
      template[1].click();
      expect(mockSend).toHaveBeenCalledWith("ui:context-menu-command", {
        commandId: "command.second",
        tabId: "tab-1",
        menuItems,
      });
    });
  });
});
