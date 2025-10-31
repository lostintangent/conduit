/**
 * Default Pane Actions Configuration
 *
 * These actions are used when no user configuration file exists.
 * Based on: docs/pane-actions-schema.md
 */

import type { Action } from './types';

/**
 * Get the default pane actions
 *
 * Returns:
 * - Source Control (enabled)
 * - Editor (enabled)
 * - Agent (enabled)
 * - Browser (disabled)
 */
export function getDefaultActions(): Action[] {
  return [
    {
      name: 'Editor',
      icon: 'code',
      enabled: true,
      paneType: 'editor',
      config: {},
    },
    {
      name: 'Agent',
      icon: 'bot',
      enabled: true,
      paneType: 'terminal',
      config: {
        command: 'claude-code',
        preCommandId: 'create-agent-session',
      },
    },
    {
      name: 'Browser',
      icon: 'globe',
      enabled: true,
      paneType: 'browser',
      config: {
        url: 'https://github.com',
      },
    },
    {
      name: 'Source Control',
      icon: 'git-branch',
      enabled: false,
      paneType: 'terminal',
      config: {
        command: 'git status',
      },
    },
  ];
}
