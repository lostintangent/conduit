import type { ContextValues } from '../contextKeys/types';

/**
 * A when clause represents a conditional expression that can be evaluated
 * against the current context to determine if a command is enabled.
 */
export interface WhenClause {
  /**
   * Evaluate the when clause against current context values
   * @param context - Current context key values
   * @returns true if the condition is met, false otherwise
   */
  evaluate: (context: ContextValues) => boolean;

  /**
   * Generate human-readable string representation
   * Used for debugging, Command Palette tooltips, keybinding editor, etc.
   * @returns String like "terminalFocus && tabCount > 0"
   */
  toString: () => string;
}
