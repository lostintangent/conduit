import { Menu } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  showContextMenu,
  type ContextMenuItemData,
} from "../../../src/ipc/ui/contextMenu";

// Mock Electron modules
vi.mock("electron", () => ({
  BrowserWindow: vi.fn(),
  Menu: {
    buildFromTemplate: vi.fn(),
  },
}));

describe("contextMenu - Submenus", () => {
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

  describe("hierarchical groups", () => {
    it("should create submenu from hierarchical group path", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "tab.duplicate",
          title: "Duplicate Tab",
          group: "2_tab",
          enabled: true,
        },
        {
          commandId: "tab.duplicateWithCwd",
          title: "with CWD...",
          group: "2_tab/duplicate_into",
          enabled: true,
          submenuLabel: "Duplicate Tab into...",
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];

      // Should have: "Duplicate Tab" and "Duplicate Tab into..." submenu
      expect(template).toHaveLength(2);
      expect(template[0].label).toBe("Duplicate Tab");
      expect(template[1].label).toBe("Duplicate Tab into...");
      expect(template[1].submenu).toBeDefined();
    });

    it("should nest multiple items in same submenu", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "tab.duplicateWithCwd",
          title: "with CWD...",
          group: "2_tab/duplicate_into",
          enabled: true,
        },
        {
          commandId: "tab.duplicateIntoWorktree",
          title: "Worktree...",
          group: "2_tab/duplicate_into",
          enabled: true,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];

      expect(template).toHaveLength(1);
      expect(template[0].submenu).toHaveLength(2);
      expect(template[0].submenu[0].label).toBe("with CWD...");
      expect(template[0].submenu[1].label).toBe("Worktree...");
    });

    it("should preserve order of items within submenu", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "command.third",
          title: "Third",
          group: "2_tab/duplicate_into",
          enabled: true,
        },
        {
          commandId: "command.first",
          title: "First",
          group: "2_tab/duplicate_into",
          enabled: true,
        },
        {
          commandId: "command.second",
          title: "Second",
          group: "2_tab/duplicate_into",
          enabled: true,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];
      const submenu = template[0].submenu;

      // Order should be preserved as passed in
      expect(submenu[0].label).toBe("Third");
      expect(submenu[1].label).toBe("First");
      expect(submenu[2].label).toBe("Second");
    });

    it("should handle mix of top-level and submenu items in same parent group", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "tab.close",
          title: "Close Tab",
          group: "2_tab",
          enabled: true,
        },
        {
          commandId: "tab.duplicate",
          title: "Duplicate Tab",
          group: "2_tab",
          enabled: true,
        },
        {
          commandId: "tab.duplicateWithCwd",
          title: "with CWD...",
          group: "2_tab/duplicate_into",
          enabled: true,
          submenuLabel: "Duplicate Tab into...",
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];

      // Should have: "Close Tab", "Duplicate Tab", "Duplicate Tab into..." submenu
      expect(template).toHaveLength(3);
      expect(template[0].label).toBe("Close Tab");
      expect(template[1].label).toBe("Duplicate Tab");
      expect(template[2].label).toBe("Duplicate Tab into...");
      expect(template[2].submenu).toBeDefined();
    });

    it("should handle multiple different submenus in same parent group", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "edit.cutInto",
          title: "File",
          group: "1_edit/cut_into",
          enabled: true,
        },
        {
          commandId: "edit.copyInto",
          title: "Clipboard",
          group: "1_edit/copy_into",
          enabled: true,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];

      // Should have two separate submenus
      expect(template).toHaveLength(2);
      expect(template[0].submenu).toBeDefined();
      expect(template[1].submenu).toBeDefined();
    });

    it("should position submenu where first submenu item appears", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "command.a",
          title: "Command A",
          group: "2_tab",
          enabled: true,
        },
        {
          commandId: "command.b",
          title: "Command B",
          group: "2_tab/submenu",
          enabled: true,
        },
        {
          commandId: "command.c",
          title: "Command C",
          group: "2_tab",
          enabled: true,
        },
        {
          commandId: "command.d",
          title: "Command D",
          group: "2_tab/submenu",
          enabled: true,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];

      // Order: Command A, Submenu (appears where first submenu item was), Command C
      expect(template).toHaveLength(3);
      expect(template[0].label).toBe("Command A");
      expect(template[1].submenu).toBeDefined(); // The submenu
      expect(template[2].label).toBe("Command C");
    });
  });

  describe("submenu properties", () => {
    it("should preserve enabled state in submenu items", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "command.enabled",
          title: "Enabled",
          group: "2_tab/submenu",
          enabled: true,
        },
        {
          commandId: "command.disabled",
          title: "Disabled",
          group: "2_tab/submenu",
          enabled: false,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];
      const submenu = template[0].submenu;

      expect(submenu[0].enabled).toBe(true);
      expect(submenu[1].enabled).toBe(false);
    });

    it("should preserve keybindings in submenu items", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "command.withKey",
          title: "With Keybinding",
          group: "2_tab/submenu",
          enabled: true,
          keybinding: "Cmd+Shift+D",
        },
        {
          commandId: "command.noKey",
          title: "Without Keybinding",
          group: "2_tab/submenu",
          enabled: true,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];
      const submenu = template[0].submenu;

      expect(submenu[0].accelerator).toBe("Cmd+Shift+D");
      expect(submenu[1].accelerator).toBeUndefined();
    });

    it("should send command when submenu item clicked", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "tab.duplicateWithCwd",
          title: "with CWD...",
          group: "2_tab/duplicate_into",
          enabled: true,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        paneId: "pane-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];
      const submenu = template[0].submenu;
      const clickHandler = submenu[0].click;

      // Simulate clicking submenu item
      clickHandler();

      expect(mockSend).toHaveBeenCalledWith("ui:context-menu-command", {
        commandId: "tab.duplicateWithCwd",
        tabId: "tab-1",
        paneId: "pane-1",
        menuItems,
      });
    });

    it("should send correct commandId for each submenu item", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "command.first",
          title: "First",
          group: "2_tab/submenu",
          enabled: true,
        },
        {
          commandId: "command.second",
          title: "Second",
          group: "2_tab/submenu",
          enabled: true,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];
      const submenu = template[0].submenu;

      // Click first submenu item
      submenu[0].click();
      expect(mockSend).toHaveBeenCalledWith(
        "ui:context-menu-command",
        expect.objectContaining({
          commandId: "command.first",
        }),
      );

      // Click second submenu item
      submenu[1].click();
      expect(mockSend).toHaveBeenCalledWith(
        "ui:context-menu-command",
        expect.objectContaining({
          commandId: "command.second",
        }),
      );
    });
  });

  describe("submenu labels", () => {
    it("should use configured label for known submenu paths", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "tab.duplicateWithCwd",
          title: "with CWD...",
          group: "2_tab/duplicate_into",
          enabled: true,
          submenuLabel: "Duplicate Tab into...",
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];

      // Should use label from submenuLabel field
      expect(template[0].label).toBe("Duplicate Tab into...");
    });

    it("should use path as fallback for unconfigured submenu paths", () => {
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "unknown.command",
          title: "Unknown",
          group: "9_group/unknown_submenu",
          enabled: true,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];

      // Should use submenu path segment as fallback
      expect(template[0].label).toBe("unknown_submenu");
    });
  });

  describe("complex scenarios", () => {
    it("should handle multiple groups with submenus and separators", () => {
      const menuItems: ContextMenuItemData[] = [
        // First group
        {
          commandId: "edit.cut",
          title: "Cut",
          group: "1_edit",
          enabled: true,
        },
        {
          commandId: "edit.cutInto.file",
          title: "File",
          group: "1_edit/cut_into",
          enabled: true,
        },
        // Second group
        {
          commandId: "view.toggle",
          title: "Toggle View",
          group: "2_view",
          enabled: true,
        },
        {
          commandId: "view.openIn.editor",
          title: "Editor",
          group: "2_view/open_in",
          enabled: true,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];

      // Group 1: Cut, Cut Into submenu
      // Separator
      // Group 2: Toggle View, Open In submenu
      expect(template).toHaveLength(5);
      expect(template[0].label).toBe("Cut"); // 1_edit
      expect(template[1].submenu).toBeDefined(); // 1_edit/cut_into
      expect(template[2].type).toBe("separator");
      expect(template[3].label).toBe("Toggle View"); // 2_view
      expect(template[4].submenu).toBeDefined(); // 2_view/open_in
    });

    it("should handle empty submenu gracefully", () => {
      // Edge case: All submenu items are filtered out, but group path exists
      // This shouldn't happen in practice, but test robustness
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "tab.close",
          title: "Close",
          group: "2_tab",
          enabled: true,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];

      // Should only have top-level item, no submenu
      expect(template).toHaveLength(1);
      expect(template[0].label).toBe("Close");
    });

    it("should handle deeply nested paths as single submenu level", () => {
      // The implementation treats "a/b/c" as submenu "b/c" under parent "a"
      const menuItems: ContextMenuItemData[] = [
        {
          commandId: "command.deep",
          title: "Deep Command",
          group: "1_group/sub1/sub2",
          enabled: true,
        },
      ];

      showContextMenu(mockWindow, {
        tabId: "tab-1",
        menuItems,
      });

      const template = (Menu.buildFromTemplate as any).mock.calls[0][0];

      // Should create submenu with path "sub1/sub2"
      expect(template).toHaveLength(1);
      expect(template[0].submenu).toBeDefined();
      expect(template[0].label).toBe("sub1/sub2"); // Fallback to full path after first /
    });
  });
});
