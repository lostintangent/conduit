/**
 * Editor commands, including the file tree's context menu
 */

import {
  activePaneType,
  paneActionsEnabled,
} from "@/commands/contextKeys/appContextKeys";
import type { CommandDescriptor } from "@/commands/core/types";
import { MenuId } from "@/commands/menus/types";
import { invokeEditorCommand } from "@features/editor/client/editorCommandHandlers";
import { fileTreeCommands } from "@features/editor/client/fileTreeCommands";
import { openEditorPane } from "@features/workbench/client/actions/pane";
import { ApplicationCommands } from "@shared/commands";

export default [
  // Pane: Split Left with Editor
  {
    id: ApplicationCommands.PANE_SPLIT_LEFT_EDITOR,
    title: "Split Editor Left",
    description: "Create a new editor pane to the left of the current pane",
    category: "Pane",
    keybinding: { key: "Cmd+Shift+E+Left" },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/2_split_editor",
      order: 1,
      title: "Left",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId && context.activeTab) {
        const sourcePane = context.activeTab.panes[targetPaneId];
        const cwd =
          sourcePane?.type === "terminal" || sourcePane?.type === "editor"
            ? sourcePane.cwd
            : null;
        if (cwd) {
          openEditorPane(targetTabId, targetPaneId, cwd, "row", true);
        }
      }
    },
  },

  // Pane: Split Right with Editor
  {
    id: ApplicationCommands.PANE_SPLIT_RIGHT_EDITOR,
    title: "Split Editor Right",
    description: "Create a new editor pane to the right of the current pane",
    category: "Pane",
    keybinding: { key: "Cmd+Shift+E+Right" },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/2_split_editor",
      order: 2,
      title: "Right",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId && context.activeTab) {
        const sourcePane = context.activeTab.panes[targetPaneId];
        const cwd =
          sourcePane?.type === "terminal" || sourcePane?.type === "editor"
            ? sourcePane.cwd
            : null;
        if (cwd) {
          openEditorPane(targetTabId, targetPaneId, cwd, "row", false);
        }
      }
    },
  },

  // Pane: Split Top with Editor
  {
    id: ApplicationCommands.PANE_SPLIT_TOP_EDITOR,
    title: "Split Editor Top",
    description: "Create a new editor pane above the current pane",
    category: "Pane",
    keybinding: { key: "Cmd+Shift+E+Up" },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/2_split_editor",
      order: 3,
      title: "Top",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId && context.activeTab) {
        const sourcePane = context.activeTab.panes[targetPaneId];
        const cwd =
          sourcePane?.type === "terminal" || sourcePane?.type === "editor"
            ? sourcePane.cwd
            : null;
        if (cwd) {
          openEditorPane(targetTabId, targetPaneId, cwd, "column", true);
        }
      }
    },
  },

  // Pane: Split Bottom with Editor
  {
    id: ApplicationCommands.PANE_SPLIT_BOTTOM_EDITOR,
    title: "Split Editor Bottom",
    description: "Create a new editor pane below the current pane",
    category: "Pane",
    keybinding: { key: "Cmd+Shift+E+Down" },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/2_split_editor",
      order: 4,
      title: "Bottom",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId && context.activeTab) {
        const sourcePane = context.activeTab.panes[targetPaneId];
        const cwd =
          sourcePane?.type === "terminal" || sourcePane?.type === "editor"
            ? sourcePane.cwd
            : null;
        if (cwd) {
          openEditorPane(targetTabId, targetPaneId, cwd, "column", false);
        }
      }
    },
  },

  // Editor: Toggle Sidebar
  {
    id: ApplicationCommands.EDITOR_TOGGLE_SIDEBAR,
    title: "Toggle File Tree",
    description: "Show or hide the file tree sidebar in the editor",
    category: "Editor",
    keybinding: { key: "Cmd+B" },
    when: activePaneType.equals("editor"),
    run: (context) => {
      if (context.activePaneId) {
        invokeEditorCommand(context.activePaneId, "toggleSidebar");
      }
    },
  },

  // Editor: Reveal Active File in File Tree
  {
    id: ApplicationCommands.EDITOR_FOCUS_SIDEBAR,
    title: "Reveal Active File in File Tree",
    description: "Reveal and select the currently active file in the file tree",
    category: "Editor",
    keybinding: { key: "Cmd+Shift+T" },
    when: activePaneType.equals("editor"),
    run: (context) => {
      if (context.activePaneId) {
        invokeEditorCommand(context.activePaneId, "revealActiveFile");
      }
    },
  },

  // Editor: Quick Open
  {
    id: ApplicationCommands.EDITOR_QUICK_OPEN,
    title: "Quick Open",
    description: "Quickly open files by name using fuzzy search",
    category: "Editor",
    keybinding: { key: "Cmd+P" },
    // No 'when' clause - works from any pane type
    run: (context) => {
      context.setIsQuickOpenOpen?.(true);
    },
  },

  ...fileTreeCommands,
] satisfies CommandDescriptor[];
