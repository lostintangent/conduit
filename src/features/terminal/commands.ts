/**
 * Terminal commands
 */

import { When } from "@/commands";
import { activePaneType, hasCwd } from "@/commands/contextKeys/appContextKeys";
import type { CommandDescriptor } from "@/commands/core/types";
import { handleOpenInVSCode } from "@features/terminal/client/terminalHandlers";
import { ApplicationCommands } from "@shared/commands";

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
] satisfies CommandDescriptor[];
