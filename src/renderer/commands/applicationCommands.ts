/**
 * Registers every feature's palette commands, keybindings and menu items.
 * Each feature lists them in its `commands.ts`, registered in folder order.
 */

import type { CommandRegistry } from "@/commands";
import type { CommandDescriptor } from "@/commands/core/types";

const featureCommands = import.meta.glob<CommandDescriptor[]>(
  "../../features/*/commands.ts",
  { eager: true, import: "default" },
);

let commandsRegistered = false;

/**
 * Reset the registration flag for testing purposes only
 * @internal
 */
export function _resetCommandRegistration(): void {
  commandsRegistered = false;
}

export function registerApplicationCommands(
  commandRegistry: CommandRegistry,
): void {
  // Only register once - subsequent calls are no-ops
  if (commandsRegistered) {
    return;
  }
  commandsRegistered = true;

  for (const commands of Object.values(featureCommands)) {
    for (const command of commands) {
      commandRegistry.registerCommand(command);
    }
  }
}
