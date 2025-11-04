import { BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";
import { ApplicationCommands } from "../../shared/commands";

export type ContextMenuCommandData = {
  keybinding?: string;
  enabled?: boolean;
};

export type ContextMenuOptions = {
  tabId: string;
  paneId?: string;
  canChangeTitle: boolean;
  hasGitRepo?: boolean;
  commandData?: Record<string, ContextMenuCommandData>;
};

export function showContextMenu(
  window: BrowserWindow,
  options: ContextMenuOptions,
) {
  if (!window || window.isDestroyed()) {
    return;
  }

  // Default commandData to empty object for simpler access
  const commandData = options.commandData ?? {};

  const sendActionToRenderer = (action: string) => {
    window.webContents.send(`ui:context-menu-action`, {
      action,
      ...options,
    });
  };

  const menuTemplate: MenuItemConstructorOptions[] = [
    {
      label: "Change title...",
      enabled: options.canChangeTitle,
      click: () => sendActionToRenderer("change-title"),
    },
    {
      label: "Duplicate tab",
      accelerator: commandData[ApplicationCommands.TAB_DUPLICATE]?.keybinding,
      enabled:
        commandData[ApplicationCommands.TAB_DUPLICATE]?.enabled !== false &&
        !options.paneId, // Only show for tab context menu, not pane
      click: () => sendActionToRenderer("duplicate-tab"),
    },
    {
      label: "Focus pane",
      enabled: !!options.paneId,
      click: () => sendActionToRenderer("focus-pane"),
    },
    { type: "separator" },
    {
      label: "Split left",
      accelerator: "Cmd+Shift+Left",
      click: () => sendActionToRenderer("split-left"),
    },
    {
      label: "Split right",
      accelerator: "Cmd+Shift+Right",
      click: () => sendActionToRenderer("split-right"),
    },
    {
      label: "Split top",
      accelerator: "Cmd+Shift+Up",
      click: () => sendActionToRenderer("split-top"),
    },
    {
      label: "Split bottom",
      accelerator: "Cmd+Shift+Down",
      click: () => sendActionToRenderer("split-bottom"),
    },
    ...(options.hasGitRepo
      ? [
          { type: "separator" as const },
          {
            label: "Split left with agent session",
            accelerator: "Cmd+Shift+Ctrl+Left",
            click: () => sendActionToRenderer("split-left-agent"),
          },
          {
            label: "Split right with agent session",
            accelerator: "Cmd+Shift+Ctrl+Right",
            click: () => sendActionToRenderer("split-right-agent"),
          },
          {
            label: "Split top with agent session",
            accelerator: "Cmd+Shift+Ctrl+Up",
            click: () => sendActionToRenderer("split-top-agent"),
          },
          {
            label: "Split bottom with agent session",
            accelerator: "Cmd+Shift+Ctrl+Down",
            click: () => sendActionToRenderer("split-bottom-agent"),
          },
        ]
      : []),
    { type: "separator" },
    {
      label: "Move left",
      accelerator: "Cmd+Alt+Left",
      click: () => sendActionToRenderer("move-left"),
    },
    {
      label: "Move right",
      accelerator: "Cmd+Alt+Right",
      click: () => sendActionToRenderer("move-right"),
    },
    {
      label: "Move up",
      accelerator: "Cmd+Alt+Up",
      click: () => sendActionToRenderer("move-up"),
    },
    {
      label: "Move down",
      accelerator: "Cmd+Alt+Down",
      click: () => sendActionToRenderer("move-down"),
    },
    { type: "separator" },
    {
      label: "Move to new tab",
      accelerator: "Cmd+Alt+T",
      click: () => sendActionToRenderer("move-to-tab"),
    },
    {
      label: "Close " + (options.paneId ? "pane" : "tab"),
      accelerator: !options.paneId
        ? commandData[ApplicationCommands.TAB_CLOSE]?.keybinding
        : undefined,
      enabled: !options.paneId
        ? commandData[ApplicationCommands.TAB_CLOSE]?.enabled !== false
        : true,
      click: () => sendActionToRenderer("close"),
    },
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  menu.popup();
}
