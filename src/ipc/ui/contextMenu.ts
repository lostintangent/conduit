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

  const sendCommandToRenderer = (commandId: string) => {
    window.webContents.send(`ui:context-menu-command`, {
      commandId,
      ...options,
    });
  };

  const menuTemplate: MenuItemConstructorOptions[] = [
    {
      label: "Change title...",
      accelerator: commandData[ApplicationCommands.TAB_CHANGE_TITLE]?.keybinding,
      enabled:
        options.canChangeTitle &&
        commandData[ApplicationCommands.TAB_CHANGE_TITLE]?.enabled !== false,
      click: () => sendCommandToRenderer(ApplicationCommands.TAB_CHANGE_TITLE),
    },
    {
      label: "Duplicate tab",
      accelerator: commandData[ApplicationCommands.TAB_DUPLICATE]?.keybinding,
      enabled:
        commandData[ApplicationCommands.TAB_DUPLICATE]?.enabled !== false &&
        !options.paneId, // Only show for tab context menu, not pane
      click: () => sendCommandToRenderer(ApplicationCommands.TAB_DUPLICATE),
    },
    {
      label: "Duplicate tab with custom directory...",
      accelerator: commandData[ApplicationCommands.TAB_DUPLICATE_WITH_CWD]?.keybinding,
      enabled:
        commandData[ApplicationCommands.TAB_DUPLICATE_WITH_CWD]?.enabled !== false &&
        !options.paneId, // Only show for tab context menu, not pane
      click: () => sendCommandToRenderer(ApplicationCommands.TAB_DUPLICATE_WITH_CWD),
    },
    {
      label: "Focus pane",
      accelerator: commandData[ApplicationCommands.PANE_FOCUS]?.keybinding,
      enabled:
        !!options.paneId &&
        commandData[ApplicationCommands.PANE_FOCUS]?.enabled !== false,
      click: () => sendCommandToRenderer(ApplicationCommands.PANE_FOCUS),
    },
    { type: "separator" },
    {
      label: "Split left",
      accelerator: commandData[ApplicationCommands.PANE_SPLIT_LEFT]?.keybinding,
      enabled: commandData[ApplicationCommands.PANE_SPLIT_LEFT]?.enabled !== false,
      click: () => sendCommandToRenderer(ApplicationCommands.PANE_SPLIT_LEFT),
    },
    {
      label: "Split right",
      accelerator: commandData[ApplicationCommands.PANE_SPLIT_RIGHT]?.keybinding,
      enabled: commandData[ApplicationCommands.PANE_SPLIT_RIGHT]?.enabled !== false,
      click: () => sendCommandToRenderer(ApplicationCommands.PANE_SPLIT_RIGHT),
    },
    {
      label: "Split top",
      accelerator: commandData[ApplicationCommands.PANE_SPLIT_TOP]?.keybinding,
      enabled: commandData[ApplicationCommands.PANE_SPLIT_TOP]?.enabled !== false,
      click: () => sendCommandToRenderer(ApplicationCommands.PANE_SPLIT_TOP),
    },
    {
      label: "Split bottom",
      accelerator: commandData[ApplicationCommands.PANE_SPLIT_BOTTOM]?.keybinding,
      enabled: commandData[ApplicationCommands.PANE_SPLIT_BOTTOM]?.enabled !== false,
      click: () => sendCommandToRenderer(ApplicationCommands.PANE_SPLIT_BOTTOM),
    },
    ...(options.hasGitRepo
      ? [
          { type: "separator" as const },
          {
            label: "Split left with agent session",
            accelerator: commandData[ApplicationCommands.PANE_SPLIT_LEFT_AGENT]?.keybinding,
            enabled: commandData[ApplicationCommands.PANE_SPLIT_LEFT_AGENT]?.enabled !== false,
            click: () => sendCommandToRenderer(ApplicationCommands.PANE_SPLIT_LEFT_AGENT),
          },
          {
            label: "Split right with agent session",
            accelerator: commandData[ApplicationCommands.PANE_SPLIT_RIGHT_AGENT]?.keybinding,
            enabled: commandData[ApplicationCommands.PANE_SPLIT_RIGHT_AGENT]?.enabled !== false,
            click: () => sendCommandToRenderer(ApplicationCommands.PANE_SPLIT_RIGHT_AGENT),
          },
          {
            label: "Split top with agent session",
            accelerator: commandData[ApplicationCommands.PANE_SPLIT_TOP_AGENT]?.keybinding,
            enabled: commandData[ApplicationCommands.PANE_SPLIT_TOP_AGENT]?.enabled !== false,
            click: () => sendCommandToRenderer(ApplicationCommands.PANE_SPLIT_TOP_AGENT),
          },
          {
            label: "Split bottom with agent session",
            accelerator: commandData[ApplicationCommands.PANE_SPLIT_BOTTOM_AGENT]?.keybinding,
            enabled: commandData[ApplicationCommands.PANE_SPLIT_BOTTOM_AGENT]?.enabled !== false,
            click: () => sendCommandToRenderer(ApplicationCommands.PANE_SPLIT_BOTTOM_AGENT),
          },
        ]
      : []),
    { type: "separator" },
    {
      label: "Move left",
      accelerator: commandData[ApplicationCommands.PANE_MOVE_LEFT]?.keybinding,
      enabled: commandData[ApplicationCommands.PANE_MOVE_LEFT]?.enabled !== false,
      click: () => sendCommandToRenderer(ApplicationCommands.PANE_MOVE_LEFT),
    },
    {
      label: "Move right",
      accelerator: commandData[ApplicationCommands.PANE_MOVE_RIGHT]?.keybinding,
      enabled: commandData[ApplicationCommands.PANE_MOVE_RIGHT]?.enabled !== false,
      click: () => sendCommandToRenderer(ApplicationCommands.PANE_MOVE_RIGHT),
    },
    {
      label: "Move up",
      accelerator: commandData[ApplicationCommands.PANE_MOVE_UP]?.keybinding,
      enabled: commandData[ApplicationCommands.PANE_MOVE_UP]?.enabled !== false,
      click: () => sendCommandToRenderer(ApplicationCommands.PANE_MOVE_UP),
    },
    {
      label: "Move down",
      accelerator: commandData[ApplicationCommands.PANE_MOVE_DOWN]?.keybinding,
      enabled: commandData[ApplicationCommands.PANE_MOVE_DOWN]?.enabled !== false,
      click: () => sendCommandToRenderer(ApplicationCommands.PANE_MOVE_DOWN),
    },
    { type: "separator" },
    {
      label: "Move to new tab",
      accelerator: commandData[ApplicationCommands.PANE_MOVE_TO_TAB]?.keybinding,
      enabled: commandData[ApplicationCommands.PANE_MOVE_TO_TAB]?.enabled !== false,
      click: () => sendCommandToRenderer(ApplicationCommands.PANE_MOVE_TO_TAB),
    },
    {
      label: "Close " + (options.paneId ? "pane" : "tab"),
      accelerator: !options.paneId
        ? commandData[ApplicationCommands.TAB_CLOSE]?.keybinding
        : commandData[ApplicationCommands.PANE_CLOSE]?.keybinding,
      enabled: !options.paneId
        ? commandData[ApplicationCommands.TAB_CLOSE]?.enabled !== false
        : commandData[ApplicationCommands.PANE_CLOSE]?.enabled !== false,
      click: () =>
        sendCommandToRenderer(
          !options.paneId
            ? ApplicationCommands.TAB_CLOSE
            : ApplicationCommands.PANE_CLOSE
        ),
    },
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  menu.popup();
}
