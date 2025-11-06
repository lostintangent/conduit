import type { Command } from "commander";

import { registerGetPanesCommand } from "./getPanes";
import { registerOpenFileCommands } from "./openFile";
import { registerReadTerminalCommand } from "./readTerminal";
import { registerWriteTerminalCommand } from "./writeTerminal";

export function registerCommands(program: Command) {
  registerOpenFileCommands(program);
  registerGetPanesCommand(program);
  registerReadTerminalCommand(program);
  registerWriteTerminalCommand(program);
}
