/**
 * Terminal commands
 */

import { When } from "@/commands";
import {
  activePaneType,
  hasCwd,
  quickPaneOpen,
} from "@/commands/contextKeys/appContextKeys";
import type { CommandDescriptor } from "@/commands/core/types";
import { MenuId } from "@/commands/menus/types";
import { handleOpenInVSCode } from "@features/terminal/client/terminalHandlers";
import { movePaneToHyperTerminal } from "@features/workbench/client/actions/hyperTerminal";
import { ApplicationCommands } from "@shared/commands";
import { PictureInPicture2 } from "lucide-react";

export default [
  // Terminal: Open in VS Code
  {
    id: ApplicationCommands.TERMINAL_OPEN_IN_VSCODE,
    title: "Open in VS Code",
    description: "Open the active directory in Visual Studio Code",
    category: "Terminal",
    when: When.and(activePaneType.equals("terminal"), hasCwd.isTrue()),
    run: (context) => {
      void handleOpenInVSCode(context.activeTab);
    },
  },

  // Terminal: Move to Hyper Terminal, from a quick pane
  {
    id: ApplicationCommands.TERMINAL_MOVE_TO_HYPER_TERMINAL,
    title: "Move to Hyper Terminal",
    description: "Move the quick terminal to a Hyper Terminal, shell and all",
    category: "Terminal",
    when: When.and(quickPaneOpen.isTrue(), activePaneType.equals("terminal")),
    menu: {
      id: MenuId.QuickPane,
      group: "1_move",
      order: 1,
      title: "Hyper Terminal",
      icon: PictureInPicture2,
      when: activePaneType.equals("terminal"),
    },
    run: (context) => {
      if (context.activeTab?.quick && context.activePaneId) {
        movePaneToHyperTerminal(context.activeTab.id, context.activePaneId);
      }
    },
  },
] satisfies CommandDescriptor[];
