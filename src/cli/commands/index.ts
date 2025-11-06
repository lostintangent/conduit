import type { Command } from "commander";

import { registerCaptureBrowserCommand } from "./captureBrowser";
import { registerListPanesCommand } from "./listPanes";
import { registerOpenFileCommands } from "./openFile";
import { registerReadTerminalCommand } from "./readTerminal";
import { registerWriteTerminalCommand } from "./writeTerminal";

export function registerCommands(program: Command) {
  registerOpenFileCommands(program);
  registerListPanesCommand(program);
  registerReadTerminalCommand(program);
  registerCaptureBrowserCommand(program);
  registerWriteTerminalCommand(program);
}
