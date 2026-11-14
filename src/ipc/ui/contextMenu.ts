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

      let submenu = submenus.get(fullSubmenuPath);
      if (!submenu) {
        // Use submenuLabel from item if provided, otherwise use submenu path as fallback
        const label = item.submenuLabel || submenuPath;
        submenu = { label, parentGroup, items: [] };
        submenus.set(fullSubmenuPath, submenu);
      }

      submenu.items.push(item);
    }
  }

  return { topLevel, submenus };
}

// While a menu is open, AppKit's tracking loop keeps the app from exiting,
// so quitting closes it first.
let openMenu: Menu | undefined;

export function closeContextMenu() {
  openMenu?.closePopup();
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

    let existingItems = grouped.get(parentGroup);
    if (!existingItems) {
      existingItems = [];
      grouped.set(parentGroup, existingItems);
    }

    if (!submenuPath) {
      // Top-level item - add directly
      existingItems.push(item);
    } else {
      // Submenu item - check if we already added this submenu placeholder
      const fullSubmenuPath = `${parentGroup}/${submenuPath}`;
      const submenuData = submenus.get(fullSubmenuPath);
      const submenuExists = existingItems.some(
        (entry) =>
          "type" in entry &&
          entry.type === "submenu" &&
          entry.submenu.path === fullSubmenuPath,
      );

      if (submenuData && !submenuExists) {
        // Add submenu placeholder
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

  // Sort groups by name
  const sortedGroups = Array.from(grouped).sort(([a], [b]) => (a < b ? -1 : 1));

  // Build menu template with separators between groups
  const menuTemplate: MenuItemConstructorOptions[] = [];

  sortedGroups.forEach(([, items], groupIndex) => {
    // Add menu items for this group
    items.forEach((item) => {
      if ("type" in item && item.type === "submenu") {
        // Add submenu
        const submenuItems: MenuItemConstructorOptions[] =
          item.submenu.items.map((subItem: ContextMenuItemData) => ({
            label: subItem.title,
            accelerator: subItem.keybinding,
            enabled: subItem.enabled,
            click: () => sendCommandToRenderer(subItem.commandId),
          }));

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
    if (groupIndex < sortedGroups.length - 1) {
      menuTemplate.push({ type: "separator" });
    }
  });

  const menu = Menu.buildFromTemplate(menuTemplate);
  openMenu = menu;
  menu.popup({
    callback: () => {
      if (openMenu === menu) {
        openMenu = undefined;
      }
    },
  });
}
