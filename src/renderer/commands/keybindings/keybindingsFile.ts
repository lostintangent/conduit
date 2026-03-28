/**
 * User keybinding from keybindings.json
 */
export interface UserKeybinding {
  key: string;
  command: string;
}

/**
 * Parse keybindings.json file
 */
export function parseKeybindingsFile(content: string): UserKeybinding[] {
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error("Keybindings file must be an array");
    }
    return parsed;
  } catch (error) {
    console.error("Failed to parse keybindings file:", error);
    return [];
  }
}

/**
 * Check if a keybinding is a removal (starts with -)
 */
export function isRemovalBinding(command: string): boolean {
  return command.startsWith("-");
}

/**
 * Get the command ID from a removal binding
 */
export function getRemovalCommandId(command: string): string {
  return command.substring(1);
}
