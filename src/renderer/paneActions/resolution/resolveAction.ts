/**
 * Action Override Resolution
 *
 * Resolves an action's configuration based on the current working directory,
 * applying path-based overrides when applicable.
 *
 * Based on: docs/pane-actions-schema.md (Override Resolution Algorithm)
 */

import type { Action, ResolvedActionConfig } from '../core/types';
import { normalizePath, findLongestMatch } from './pathUtils';

/**
 * Resolve an action's configuration for a given current working directory
 *
 * Algorithm:
 * 1. Normalize the current working directory
 * 2. Normalize all override paths
 * 3. Find the longest matching override path
 * 4. If a match is found, use override's paneType and config
 * 5. If no match, use action's default paneType and config
 *
 * @param action - The action to resolve
 * @param cwd - Current working directory (will be normalized)
 * @returns Resolved pane type and configuration
 */
export function resolveAction(
  action: Action,
  cwd: string
): ResolvedActionConfig {
  // Normalize current working directory
  const normalizedCwd = normalizePath(cwd);

  // If no overrides, return default config
  if (!action.overrides || action.overrides.length === 0) {
    return {
      paneType: action.paneType,
      config: action.config,
    };
  }

  // Normalize all override paths and find longest match
  const normalizedOverridePaths = action.overrides.map((override) =>
    normalizePath(override.path)
  );

  const matchIndex = findLongestMatch(normalizedCwd, normalizedOverridePaths);

  // No match found, return default config
  if (matchIndex === -1) {
    return {
      paneType: action.paneType,
      config: action.config,
    };
  }

  // Match found, use override config
  const matchedOverride = action.overrides[matchIndex];

  return {
    // Use override's paneType if specified, otherwise use action's paneType
    paneType: matchedOverride.paneType ?? action.paneType,
    config: matchedOverride.config,
  };
}
