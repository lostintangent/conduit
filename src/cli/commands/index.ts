import type { Command } from "commander";

import { registerGetPanesCommand } from "./getPanes";
import { registerOpenFileCommands } from "./openFile";

export function registerCommands(program: Command) {
  registerOpenFileCommands(program);
  registerGetPanesCommand(program);
}
