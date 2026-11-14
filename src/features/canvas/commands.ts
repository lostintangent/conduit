/**
 * Canvas commands: splitting a pane with a canvas
 */

import { paneActionsEnabled } from "@/commands/contextKeys/appContextKeys";
import type { CommandDescriptor } from "@/commands/core/types";
import { MenuId } from "@/commands/menus/types";
import { openCanvasPane } from "@features/workbench/client/actions/pane";
import { ApplicationCommands } from "@shared/commands";

export default [
  // Pane: Split Left with Canvas
  {
    id: ApplicationCommands.PANE_SPLIT_LEFT_CANVAS,
    title: "Split Canvas Left",
    description: "Create a new canvas pane to the left of the current pane",
    category: "Pane",
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/4_split_canvas",
      order: 1,
      title: "Left",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        openCanvasPane(targetTabId, targetPaneId, "row", true);
      }
    },
  },

  // Pane: Split Right with Canvas
  {
    id: ApplicationCommands.PANE_SPLIT_RIGHT_CANVAS,
    title: "Split Canvas Right",
    description: "Create a new canvas pane to the right of the current pane",
    category: "Pane",
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/4_split_canvas",
      order: 2,
      title: "Right",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        openCanvasPane(targetTabId, targetPaneId, "row", false);
      }
    },
  },

  // Pane: Split Top with Canvas
  {
    id: ApplicationCommands.PANE_SPLIT_TOP_CANVAS,
    title: "Split Canvas Top",
    description: "Create a new canvas pane above the current pane",
    category: "Pane",
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/4_split_canvas",
      order: 3,
      title: "Top",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        openCanvasPane(targetTabId, targetPaneId, "column", true);
      }
    },
  },

  // Pane: Split Bottom with Canvas
  {
    id: ApplicationCommands.PANE_SPLIT_BOTTOM_CANVAS,
    title: "Split Canvas Bottom",
    description: "Create a new canvas pane below the current pane",
    category: "Pane",
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/4_split_canvas",
      order: 4,
      title: "Bottom",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        openCanvasPane(targetTabId, targetPaneId, "column", false);
      }
    },
  },
] satisfies CommandDescriptor[];
