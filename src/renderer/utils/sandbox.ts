import type { EditorPane, Tab, TerminalPane } from "@/types";

export type UnifiedSandboxInfo = {
  type: "agent";
  agentSessionId: string;
} | null;

/**
 * Determines if all panes in a tab (excluding browsers) share the same sandbox context.
 * Returns the unified sandbox info if they do, or null if they don't.
 */
export function getUnifiedSandboxForTab(tab: Tab): UnifiedSandboxInfo {
  const nonBrowserPanes = Object.values(tab.panes).filter(
    (pane) => pane.type !== "browser",
  ) as (TerminalPane | EditorPane)[];

  // If there are no non-browser panes, no unified sandbox
  if (nonBrowserPanes.length === 0) {
    return null;
  }

  // Check for unified agent session
  const firstPane = nonBrowserPanes[0];
  const firstAgentSessionId = firstPane.agentSessionId;

  if (firstAgentSessionId) {
    // Check if all panes have the same agentSessionId
    const allHaveSameAgent = nonBrowserPanes.every(
      (pane) => pane.agentSessionId === firstAgentSessionId,
    );

    if (allHaveSameAgent) {
      return {
        type: "agent",
        agentSessionId: firstAgentSessionId,
      };
    }
  }

  return null;
}
