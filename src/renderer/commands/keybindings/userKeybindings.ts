import {
  parseKeybindingsFile,
  isRemovalBinding,
  getRemovalCommandId,
} from "./keybindingsFile";
import type { KeybindingRegistry } from "./KeybindingRegistry";
import type { ICommandRegistry } from "../core/CommandRegistry";
import { USER_KEYBINDING_WEIGHT, type UserKeybinding } from "./types";
import { updateKeybindingsAtom } from "./updateKeybindingsAtom";

/**
 * Get the path to the user keybindings file
 */
export function getUserKeybindingsPath(homeDirectory: string): string {
  return `${homeDirectory}/.conduit/keybindings.json`;
}

/**
 * Get the parent directory of a file path.
 * Used to determine the cwd for fsv2 operations.
 */
function getParentDirectory(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  return lastSlash > 0 ? filePath.substring(0, lastSlash) : "/";
}

/**
 * Read user keybindings from file
 * Returns empty array if file doesn't exist
 */
async function readUserKeybindingsFile(
  filePath: string,
): Promise<UserKeybinding[]> {
  if (!window.conduit?.fsv2?.readTextFile) {
    console.warn("window.conduit.fsv2.readTextFile is not available");
    return [];
  }

  try {
    const cwd = getParentDirectory(filePath);
    const content = await window.conduit.fsv2.readTextFile(cwd, filePath);
    if (!content) return [];
    return parseKeybindingsFile(content);
  } catch (error: any) {
    // File doesn't exist yet, that's ok - start with empty array
    if (error?.message?.includes("ENOENT")) {
      return [];
    }
    throw error;
  }
}

/**
 * Write user keybindings to file
 */
async function writeUserKeybindingsFile(
  filePath: string,
  bindings: UserKeybinding[],
): Promise<void> {
  if (!window.conduit?.fsv2?.writeFile) {
    throw new Error("window.conduit.fsv2.writeFile is not available");
  }

  const json = JSON.stringify(bindings, null, 2);
  const cwd = getParentDirectory(filePath);
  const encoder = new TextEncoder();
  await window.conduit.fsv2.writeFile(cwd, filePath, encoder.encode(json));
}

/**
 * Load user keybindings from file
 *
 * Note: window.conduit API is defined globally in src/renderer/global.d.ts
 */
export async function loadUserKeybindings(
  keybindingRegistry: KeybindingRegistry,
  filePath: string,
): Promise<void> {
  try {
    // Read file using fsv2 API
    const cwd = getParentDirectory(filePath);
    const content = await window.conduit?.fsv2?.readTextFile?.(cwd, filePath);
    if (!content) return;

    const userBindings = parseKeybindingsFile(content);

    // Apply user keybindings with higher weight
    for (const binding of userBindings) {
      if (isRemovalBinding(binding.command)) {
        // Remove keybinding for this command
        const commandId = getRemovalCommandId(binding.command);
        keybindingRegistry.unregister(commandId);
      } else {
        // Unregister all existing keybindings for this command first
        // (removes defaults so only the user's binding is active)
        keybindingRegistry.unregister(binding.command);

        // Add keybinding with high weight (user bindings override defaults)
        keybindingRegistry.register(
          binding.command,
          { key: binding.key },
          USER_KEYBINDING_WEIGHT,
        );
      }
    }
  } catch (error: any) {
    // Don't log error if file doesn't exist yet - that's expected on first run
    if (!error?.message?.includes("ENOENT")) {
      console.error("Failed to load user keybindings:", error);
    }
  }
}

/**
 * Save a user keybinding to file and update the registry
 *
 * This will:
 * 1. Read existing user keybindings
 * 2. Remove any existing binding for this command
 * 3. Add the new binding
 * 4. Write back to file
 * 5. Update the keybinding registry
 * 6. Update the global atom for reactive components
 */
export async function saveUserKeybinding(
  commandId: string,
  keybinding: string,
  filePath: string,
  keybindingRegistry: KeybindingRegistry,
): Promise<void> {
  // Read existing user keybindings
  let userBindings = await readUserKeybindingsFile(filePath);

  // Remove existing binding for this command
  userBindings = userBindings.filter((kb) => kb.command !== commandId);

  // Add new binding
  userBindings.push({
    key: keybinding,
    command: commandId,
  });

  // Save to file
  await writeUserKeybindingsFile(filePath, userBindings);

  // Unregister all existing keybindings for this command first
  keybindingRegistry.unregister(commandId);

  // Register new keybinding in registry with high weight
  keybindingRegistry.register(
    commandId,
    {
      key: keybinding,
    },
    USER_KEYBINDING_WEIGHT,
  );

  // Update global atom for reactive components
  updateKeybindingsAtom();
}

/**
 * Remove a user keybinding and restore defaults
 *
 * This will:
 * 1. Read existing user keybindings
 * 2. Remove the binding for this command
 * 3. Write back to file
 * 4. Unregister all keybindings for the command
 * 5. Re-register default keybindings (if any)
 * 6. Update the global atom for reactive components
 */
export async function removeUserKeybinding(
  commandId: string,
  filePath: string,
  commandRegistry: ICommandRegistry,
  keybindingRegistry: KeybindingRegistry,
): Promise<void> {
  // Read existing user keybindings
  let userBindings = await readUserKeybindingsFile(filePath);

  // Remove binding for this command
  userBindings = userBindings.filter((kb) => kb.command !== commandId);

  // Save to file
  await writeUserKeybindingsFile(filePath, userBindings);

  // Restore defaults
  restoreDefaultKeybindings(commandId, commandRegistry, keybindingRegistry);

  // Update global atom for reactive components
  updateKeybindingsAtom();
}

/**
 * Restore default keybindings for a command
 *
 * This unregisters all keybindings for the command and re-registers
 * the defaults from the command descriptor.
 */
export function restoreDefaultKeybindings(
  commandId: string,
  commandRegistry: ICommandRegistry,
  keybindingRegistry: KeybindingRegistry,
): void {
  // Unregister all keybindings for this command
  keybindingRegistry.unregister(commandId);

  // Get the command to find its default keybinding
  const command = commandRegistry.getCommand(commandId);
  if (command?.keybinding) {
    // Re-register the default keybinding
    const keybindings = Array.isArray(command.keybinding)
      ? command.keybinding
      : [command.keybinding];

    for (const binding of keybindings) {
      keybindingRegistry.register(commandId, binding, 0); // Default weight
    }
  }
}
