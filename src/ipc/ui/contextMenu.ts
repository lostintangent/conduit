import { BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";

export interface ContextMenuItemData {
  commandId: string;
  title: string;
  group: string;
  enabled: boolean;
  keybinding?: string;
}

export interface ContextMenuOptions {
  tabId: string;
  paneId?: string;
  menuItems: ContextMenuItemData[];
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

  // Group menu items by group property
  const grouped = options.menuItems.reduce(
    (acc, item) => {
      if (!acc[item.group]) {
        acc[item.group] = [];
      }
      acc[item.group].push(item);
      return acc;
    },
    {} as Record<string, ContextMenuItemData[]>,
  );

  // Get sorted group names (they're already prefixed with numbers for ordering)
  const groupNames = Object.keys(grouped).sort();

  // Build menu template with separators between groups
  const menuTemplate: MenuItemConstructorOptions[] = [];

  groupNames.forEach((groupName, groupIndex) => {
    const items = grouped[groupName];

    // Add menu items for this group
    items.forEach((item) => {
      menuTemplate.push({
        label: item.title,
        accelerator: item.keybinding,
        enabled: item.enabled,
        click: () => sendCommandToRenderer(item.commandId),
      });
    });

    // Add separator after each group except the last
    if (groupIndex < groupNames.length - 1) {
      menuTemplate.push({ type: "separator" });
    }
  });

  const menu = Menu.buildFromTemplate(menuTemplate);
  menu.popup();
}
