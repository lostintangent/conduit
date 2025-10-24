import { BrowserWindow, Menu } from "electron";

export type ContextMenuOptions = {
  tabId: string;
  paneId?: string;
  canChangeTitle: boolean;
  hasGitRepo?: boolean;
};

export function showContextMenu(
  window: BrowserWindow,
  options: ContextMenuOptions
) {
  if (!window || window.isDestroyed()) {
    return;
  }

  const sendActionToRenderer = (action: string) => {
    window.webContents.send(`ui:context-menu-action`, {
      action,
      ...options,
    });
  };

  const menu = Menu.buildFromTemplate([
    {
      label: "Change title...",
      enabled: options.canChangeTitle,
      click: () => sendActionToRenderer("change-title"),
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
      label: "Close " + (options.paneId ? "terminal" : "tab"),
      click: () => sendActionToRenderer("close"),
    },
  ]);

  menu.popup();
}
