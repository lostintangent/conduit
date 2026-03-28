import { describe, it, expect, beforeEach } from "vitest";
import { MenuRegistry } from "@/commands/menus/MenuRegistry";
import { MenuId } from "@/commands/menus/types";
import type { MenuContribution } from "@/commands/menus/types";
import { When } from "@/commands/whenClauses/When";

describe("MenuRegistry", () => {
  let registry: MenuRegistry;

  beforeEach(() => {
    registry = new MenuRegistry();
  });

  describe("register()", () => {
    it("should register a menu item", () => {
      const contribution: MenuContribution = {
        id: MenuId.CommandPalette,
      };

      registry.register("test.command", contribution);

      const items = registry.getMenuItems(MenuId.CommandPalette);
      expect(items).toHaveLength(1);
      expect(items[0].commandId).toBe("test.command");
    });

    it("should register in multiple menus", () => {
      registry.register("test.command1", { id: MenuId.CommandPalette });
      registry.register("test.command2", { id: MenuId.PaneContext });

      expect(registry.getMenuItems(MenuId.CommandPalette)).toHaveLength(1);
      expect(registry.getMenuItems(MenuId.PaneContext)).toHaveLength(1);
    });

    it("should set default group when not specified", () => {
      registry.register("test.command", { id: MenuId.CommandPalette });

      const items = registry.getMenuItems(MenuId.CommandPalette);
      expect(items[0].group).toBe("default");
    });

    it("should use specified group", () => {
      registry.register("test.command", {
        id: MenuId.CommandPalette,
        group: "navigation",
      });

      const items = registry.getMenuItems(MenuId.CommandPalette);
      expect(items[0].group).toBe("navigation");
    });

    it("should set default order to 0 when not specified", () => {
      registry.register("test.command", { id: MenuId.CommandPalette });

      const items = registry.getMenuItems(MenuId.CommandPalette);
      expect(items[0].order).toBe(0);
    });

    it("should use specified order", () => {
      registry.register("test.command", {
        id: MenuId.CommandPalette,
        order: 10,
      });

      const items = registry.getMenuItems(MenuId.CommandPalette);
      expect(items[0].order).toBe(10);
    });

    it("should preserve when clause", () => {
      const whenClause = When.always();
      registry.register("test.command", {
        id: MenuId.CommandPalette,
        when: whenClause,
      });

      const items = registry.getMenuItems(MenuId.CommandPalette);
      expect(items[0].when).toBe(whenClause);
    });

    it("should preserve icon", () => {
      registry.register("test.command", {
        id: MenuId.CommandPalette,
        icon: "test-icon",
      });

      const items = registry.getMenuItems(MenuId.CommandPalette);
      expect(items[0].icon).toBe("test-icon");
    });

    it("should allow multiple commands in same menu", () => {
      registry.register("command1", { id: MenuId.CommandPalette });
      registry.register("command2", { id: MenuId.CommandPalette });
      registry.register("command3", { id: MenuId.CommandPalette });

      const items = registry.getMenuItems(MenuId.CommandPalette);
      expect(items).toHaveLength(3);
    });
  });

  describe("getMenuItems()", () => {
    it("should return empty array for menu with no items", () => {
      const items = registry.getMenuItems(MenuId.CommandPalette);
      expect(items).toEqual([]);
    });

    it("should return all items for a menu", () => {
      registry.register("command1", { id: MenuId.CommandPalette });
      registry.register("command2", { id: MenuId.CommandPalette });
      registry.register("command3", { id: MenuId.PaneContext });

      const paletteItems = registry.getMenuItems(MenuId.CommandPalette);
      expect(paletteItems).toHaveLength(2);
    });

    it("should not affect items when retrieved", () => {
      registry.register("command1", { id: MenuId.CommandPalette });

      const items1 = registry.getMenuItems(MenuId.CommandPalette);
      const items2 = registry.getMenuItems(MenuId.CommandPalette);

      expect(items1).toHaveLength(1);
      expect(items2).toHaveLength(1);
    });
  });

  describe("getSortedMenuItems()", () => {
    it("should sort by group alphabetically", () => {
      registry.register("command1", {
        id: MenuId.CommandPalette,
        group: "z_last",
      });
      registry.register("command2", {
        id: MenuId.CommandPalette,
        group: "a_first",
      });
      registry.register("command3", {
        id: MenuId.CommandPalette,
        group: "m_middle",
      });

      const items = registry.getSortedMenuItems(MenuId.CommandPalette);
      expect(items[0].commandId).toBe("command2");
      expect(items[1].commandId).toBe("command3");
      expect(items[2].commandId).toBe("command1");
    });

    it("should sort by order within same group", () => {
      registry.register("command1", {
        id: MenuId.CommandPalette,
        group: "edit",
        order: 30,
      });
      registry.register("command2", {
        id: MenuId.CommandPalette,
        group: "edit",
        order: 10,
      });
      registry.register("command3", {
        id: MenuId.CommandPalette,
        group: "edit",
        order: 20,
      });

      const items = registry.getSortedMenuItems(MenuId.CommandPalette);
      expect(items[0].commandId).toBe("command2");
      expect(items[1].commandId).toBe("command3");
      expect(items[2].commandId).toBe("command1");
    });

    it("should sort by group first, then order", () => {
      registry.register("command1", {
        id: MenuId.CommandPalette,
        group: "navigation",
        order: 1,
      });
      registry.register("command2", {
        id: MenuId.CommandPalette,
        group: "edit",
        order: 100,
      });
      registry.register("command3", {
        id: MenuId.CommandPalette,
        group: "navigation",
        order: 2,
      });

      const items = registry.getSortedMenuItems(MenuId.CommandPalette);
      // 'edit' comes before 'navigation' alphabetically
      expect(items[0].commandId).toBe("command2");
      expect(items[1].commandId).toBe("command1");
      expect(items[2].commandId).toBe("command3");
    });

    it("should handle negative order values", () => {
      registry.register("command1", {
        id: MenuId.CommandPalette,
        group: "edit",
        order: 10,
      });
      registry.register("command2", {
        id: MenuId.CommandPalette,
        group: "edit",
        order: -5,
      });

      const items = registry.getSortedMenuItems(MenuId.CommandPalette);
      expect(items[0].commandId).toBe("command2");
      expect(items[1].commandId).toBe("command1");
    });

    it("should return empty array for menu with no items", () => {
      const items = registry.getSortedMenuItems(MenuId.CommandPalette);
      expect(items).toEqual([]);
    });
  });

  describe("unregister()", () => {
    it("should remove all menu items for a command", () => {
      registry.register("command1", { id: MenuId.CommandPalette });
      registry.register("command1", { id: MenuId.PaneContext });
      registry.register("command2", { id: MenuId.CommandPalette });

      expect(registry.getMenuItems(MenuId.CommandPalette)).toHaveLength(2);
      expect(registry.getMenuItems(MenuId.PaneContext)).toHaveLength(1);

      registry.unregister("command1");

      expect(registry.getMenuItems(MenuId.CommandPalette)).toHaveLength(1);
      expect(registry.getMenuItems(MenuId.CommandPalette)[0].commandId).toBe(
        "command2",
      );
      expect(registry.getMenuItems(MenuId.PaneContext)).toHaveLength(0);
    });

    it("should not affect other commands", () => {
      registry.register("command1", { id: MenuId.CommandPalette });
      registry.register("command2", { id: MenuId.CommandPalette });
      registry.register("command3", { id: MenuId.CommandPalette });

      registry.unregister("command2");

      const items = registry.getMenuItems(MenuId.CommandPalette);
      expect(items).toHaveLength(2);
      expect(items.some((item) => item.commandId === "command1")).toBe(true);
      expect(items.some((item) => item.commandId === "command3")).toBe(true);
    });

    it("should handle unregistering non-existent command", () => {
      registry.register("command1", { id: MenuId.CommandPalette });

      registry.unregister("nonexistent.command");

      expect(registry.getMenuItems(MenuId.CommandPalette)).toHaveLength(1);
    });

    it("should remove items from multiple menus", () => {
      registry.register("command1", { id: MenuId.CommandPalette });
      registry.register("command1", { id: MenuId.PaneContext });
      registry.register("command1", { id: MenuId.TabContext });

      registry.unregister("command1");

      expect(registry.getMenuItems(MenuId.CommandPalette)).toHaveLength(0);
      expect(registry.getMenuItems(MenuId.PaneContext)).toHaveLength(0);
      expect(registry.getMenuItems(MenuId.TabContext)).toHaveLength(0);
    });
  });

  describe("clear()", () => {
    it("should clear all menus", () => {
      registry.register("command1", { id: MenuId.CommandPalette });
      registry.register("command2", { id: MenuId.PaneContext });
      registry.register("command3", { id: MenuId.TabContext });

      registry.clear();

      expect(registry.getMenuItems(MenuId.CommandPalette)).toEqual([]);
      expect(registry.getMenuItems(MenuId.PaneContext)).toEqual([]);
      expect(registry.getMenuItems(MenuId.TabContext)).toEqual([]);
    });
  });

  describe("all menu types", () => {
    it("should support all menu IDs", () => {
      registry.register("cmd1", { id: MenuId.CommandPalette });
      registry.register("cmd2", { id: MenuId.PaneContext });
      registry.register("cmd3", { id: MenuId.TabContext });
      registry.register("cmd4", { id: MenuId.TitleBar });
      registry.register("cmd5", { id: MenuId.EditorContext });
      registry.register("cmd6", { id: MenuId.TerminalContext });

      expect(registry.getMenuItems(MenuId.CommandPalette)).toHaveLength(1);
      expect(registry.getMenuItems(MenuId.PaneContext)).toHaveLength(1);
      expect(registry.getMenuItems(MenuId.TabContext)).toHaveLength(1);
      expect(registry.getMenuItems(MenuId.TitleBar)).toHaveLength(1);
      expect(registry.getMenuItems(MenuId.EditorContext)).toHaveLength(1);
      expect(registry.getMenuItems(MenuId.TerminalContext)).toHaveLength(1);
    });
  });

  describe("title override", () => {
    it("should store title override when provided", () => {
      registry.register("test.command", {
        id: MenuId.TabContext,
        title: "Short Title",
      });

      const items = registry.getMenuItems(MenuId.TabContext);
      expect(items[0].title).toBe("Short Title");
    });

    it("should not store title when not provided", () => {
      registry.register("test.command", {
        id: MenuId.TabContext,
      });

      const items = registry.getMenuItems(MenuId.TabContext);
      expect(items[0].title).toBeUndefined();
    });

    it("should allow different titles for same command in different menus", () => {
      registry.register("test.command", {
        id: MenuId.TabContext,
        title: "Tab Title",
      });
      registry.register("test.command", {
        id: MenuId.PaneContext,
        title: "Pane Title",
      });

      const tabItems = registry.getMenuItems(MenuId.TabContext);
      const paneItems = registry.getMenuItems(MenuId.PaneContext);

      expect(tabItems[0].title).toBe("Tab Title");
      expect(paneItems[0].title).toBe("Pane Title");
    });

    it("should preserve title through sorting", () => {
      registry.register("command1", {
        id: MenuId.CommandPalette,
        group: "z_last",
        order: 2,
        title: "Command 1 Override",
      });
      registry.register("command2", {
        id: MenuId.CommandPalette,
        group: "a_first",
        order: 1,
        title: "Command 2 Override",
      });

      const items = registry.getSortedMenuItems(MenuId.CommandPalette);
      expect(items[0].title).toBe("Command 2 Override");
      expect(items[1].title).toBe("Command 1 Override");
    });

    it("should work with hierarchical groups", () => {
      registry.register("submenu.command", {
        id: MenuId.TabContext,
        group: "2_tab/duplicate_into",
        title: "with CWD...",
      });

      const items = registry.getMenuItems(MenuId.TabContext);
      expect(items[0].title).toBe("with CWD...");
      expect(items[0].group).toBe("2_tab/duplicate_into");
    });
  });

  describe("hierarchical groups", () => {
    it("should store hierarchical group paths", () => {
      registry.register("test.command", {
        id: MenuId.TabContext,
        group: "2_tab/duplicate_into",
      });

      const items = registry.getMenuItems(MenuId.TabContext);
      expect(items[0].group).toBe("2_tab/duplicate_into");
    });

    it("should sort hierarchical groups correctly", () => {
      registry.register("top", {
        id: MenuId.TabContext,
        group: "2_tab",
        order: 1,
      });
      registry.register("nested", {
        id: MenuId.TabContext,
        group: "2_tab/submenu",
        order: 2,
      });

      const items = registry.getSortedMenuItems(MenuId.TabContext);

      // Both have same parent group "2_tab", sorted by order
      expect(items[0].commandId).toBe("top");
      expect(items[1].commandId).toBe("nested");
    });

    it("should handle multiple levels of nesting in group name", () => {
      registry.register("deep", {
        id: MenuId.TabContext,
        group: "1_group/sub1/sub2/sub3",
      });

      const items = registry.getMenuItems(MenuId.TabContext);
      expect(items[0].group).toBe("1_group/sub1/sub2/sub3");
    });
  });
});
