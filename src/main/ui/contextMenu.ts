import type { ContextMenuItemData, ContextMenuOptions } from "@shared/commands";
import { BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";
import { emitter } from "../events";

const emit = emitter("workbench");

/** The items in their groups' order, with a separator between groups */
function toTemplate(
  items: ContextMenuItemData[],
  click: (commandId: string) => void,
): MenuItemConstructorOptions[] {
  const groups = new Map<string, ContextMenuItemData[]>();
  for (const item of items) {
    groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  }

  return [...groups]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([, group], index) => [
      ...(index > 0 ? [{ type: "separator" as const }] : []),
      ...group.map((item) =>
        "submenu" in item
          ? { label: item.title, submenu: toTemplate(item.submenu, click) }
          : {
              label: item.title,
              accelerator: item.keybinding,
              enabled: item.enabled,
              click: () => click(item.commandId),
            },
      ),
    ]);
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

  const menu = Menu.buildFromTemplate(
    toTemplate(options.menuItems, (commandId) =>
      emit("contextMenuCommand", { commandId, ...options }),
    ),
  );
  openMenu = menu;
  menu.popup({
    callback: () => {
      if (openMenu === menu) {
        openMenu = undefined;
      }
    },
  });
}
