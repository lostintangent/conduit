import { BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";

export interface ContextMenuItemData {
  commandId: string;
  title: string;
  group: string;
  enabled: boolean;
  keybinding?: string;
  submenuLabel?: string;
}

export interface ContextMenuOptions {
  tabId: string;
  paneId?: string;
  menuItems: ContextMenuItemData[];
}

/**
 * Parse a group string into parent group and submenu segment
 */
function parseGroupPath(group: string): {
  parentGroup: string;
  submenuPath?: string;
} {
  const slashIndex = group.indexOf("/");
  if (slashIndex === -1) {
    return { parentGroup: group };
  }

  return {
    parentGroup: group.substring(0, slashIndex),
    submenuPath: group.substring(slashIndex + 1),
  };
}

interface GroupedItems {
  topLevel: ContextMenuItemData[];
  submenus: Map<
    string,
    {
      label: string;
      parentGroup: string;
      items: ContextMenuItemData[];
    }
  >;
}

/**
 * Group menu items by their parent group and submenu path
 */
function groupMenuItems(items: ContextMenuItemData[]): GroupedItems {
  const topLevel: ContextMenuItemData[] = [];
  const submenus = new Map<
    string,
    {
      label: string;
      parentGroup: string;
      items: ContextMenuItemData[];
    }
  >();

  for (const item of items) {
    const { parentGroup, submenuPath } = parseGroupPath(item.group);

    if (!submenuPath) {
      // Top-level item
      topLevel.push(item);
    } else {
      // Submenu item
      const fullSubmenuPath = `${parentGroup}/${submenuPath}`;

      if (!submenus.has(fullSubmenuPath)) {
        // Use submenuLabel from item if provided, otherwise use submenu path as fallback
        const label = item.submenuLabel || submenuPath;
        submenus.set(fullSubmenuPath, {
          label,
          parentGroup,
          items: [],
        });
      }

      submenus.get(fullSubmenuPath)!.items.push(item);
    }
  }

  return { topLevel, submenus };
}

export function showContextMenu(
  window: BrowserWindow,
  options: ContextMenuOptions,
) {
  if (!window || window.isDestroyed()) {
    return;
  }

  const sendCommandToRenderer = (commandId: string) => {
    window.webContents.send(`ui:context-menu-command`, {
      commandId,
      ...options,
    });
  };

  // Group items into top-level and submenus
  const { submenus } = groupMenuItems(options.menuItems);

  // Define submenu entry type
  interface SubmenuEntry {
    type: "submenu";
    submenu: {
      path: string;
      label: string;
      items: ContextMenuItemData[];
    };
  }

  // Group all items (top-level and submenus) by parent group
  const grouped = new Map<string, Array<ContextMenuItemData | SubmenuEntry>>();

  // Process items in original order to maintain proper positioning
  for (const item of options.menuItems) {
    const { parentGroup, submenuPath } = parseGroupPath(item.group);

    if (!grouped.has(parentGroup)) {
      grouped.set(parentGroup, []);
    }

    if (!submenuPath) {
      // Top-level item - add directly
      grouped.get(parentGroup)!.push(item);
    } else {
      // Submenu item - check if we already added this submenu placeholder
      const fullSubmenuPath = `${parentGroup}/${submenuPath}`;
      const existingItems = grouped.get(parentGroup)!;
      const submenuExists = existingItems.some(
        (entry) => "type" in entry && entry.type === "submenu" && entry.submenu.path === fullSubmenuPath
      );

      if (!submenuExists) {
        // Add submenu placeholder
        const submenuData = submenus.get(fullSubmenuPath)!;
        existingItems.push({
          type: "submenu",
          submenu: {
            path: fullSubmenuPath,
            label: submenuData.label,
            items: submenuData.items,
          },
        });
      }
    }
  }

  // Sort groups
  const sortedGroupNames = Array.from(grouped.keys()).sort();

  // Build menu template with separators between groups
  const menuTemplate: MenuItemConstructorOptions[] = [];

  sortedGroupNames.forEach((groupName, groupIndex) => {
    const items = grouped.get(groupName)!;

    // Add menu items for this group
    items.forEach((item) => {
      if ("type" in item && item.type === "submenu") {
        // Add submenu
        const submenuItems: MenuItemConstructorOptions[] = item.submenu.items.map(
          (subItem: ContextMenuItemData) => ({
            label: subItem.title,
            accelerator: subItem.keybinding,
            enabled: subItem.enabled,
            click: () => sendCommandToRenderer(subItem.commandId),
          }),
        );

        menuTemplate.push({
          label: item.submenu.label,
          submenu: submenuItems,
        });
      } else {
        // Add regular menu item
        const menuItem = item as ContextMenuItemData;
        menuTemplate.push({
          label: menuItem.title,
          accelerator: menuItem.keybinding,
          enabled: menuItem.enabled,
          click: () => sendCommandToRenderer(menuItem.commandId),
        });
      }
    });

    // Add separator after each group except the last
    if (groupIndex < sortedGroupNames.length - 1) {
      menuTemplate.push({ type: "separator" });
    }
  });

  const menu = Menu.buildFromTemplate(menuTemplate);
  menu.popup();
}
