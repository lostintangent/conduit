/**
 * Default Pane Actions Configuration
 *
 * These actions are used when no user configuration file exists.
 * Based on: docs/pane-actions-schema.md
 */

import type { Action } from "./types";

/**
 * Get the default pane actions
 *
 * Returns:
 * - Agent (enabled)
 * - Editor (enabled)
 * - Browser (enabled)
 * - Canvas (enabled)
 * - Cloud Terminal (disabled)
 */
export function getDefaultActions(): Action[] {
  return [
    {
      name: "Agent",
      icon: "bot",
      enabled: true,
      paneType: "terminal",
      config: {
        command: "copilot",
        preCommandId: "create-agent-session",
      },
    },
    {
      name: "Editor",
      icon: "code",
      enabled: true,
      paneType: "editor",
      config: {},
    },
    {
      name: "Browser",
      icon: "globe",
      enabled: true,
      paneType: "browser",
      config: {
        url: "https://github.com",
      },
    },
    {
      name: "Canvas",
      icon: "palette",
      enabled: true,
      paneType: "canvas",
      config: {},
    },
    {
      name: "Cloud",
      icon: "cloud",
      enabled: false,
      paneType: "terminal",
      config: {
        command: "",
        preCommandId: "detect-github-repo-for-cloud",
      },
    },
  ];
}
