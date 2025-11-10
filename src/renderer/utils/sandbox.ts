import type { Tab, TerminalPane, EditorPane } from "@/types";

export type UnifiedSandboxInfo =
  | {
      type: "agent";
      agentSessionId: string;
    }
  | {
      type: "vm";
      vmId: string;
    }
  | null;

/**
 * Determines if all panes in a tab (excluding webviews) share the same sandbox context.
 * Returns the unified sandbox info if they do, or null if they don't.
 */
export function getUnifiedSandboxForTab(tab: Tab): UnifiedSandboxInfo {
  const nonWebviewPanes = Object.values(tab.panes).filter(
    (pane) => pane.type !== "webview",
  ) as (TerminalPane | EditorPane)[];

  // If there are no non-webview panes, no unified sandbox
  if (nonWebviewPanes.length === 0) {
    return null;
  }

  // Check for unified agent session
  const firstPane = nonWebviewPanes[0];
  const firstAgentSessionId = firstPane.agentSessionId;

  if (firstAgentSessionId) {
    // Check if all panes have the same agentSessionId
    const allHaveSameAgent = nonWebviewPanes.every(
      (pane) => pane.agentSessionId === firstAgentSessionId,
    );

    if (allHaveSameAgent) {
      return {
        type: "agent",
        agentSessionId: firstAgentSessionId,
      };
    }
  }

  // Check for unified VM
  const firstVmId =
    firstPane.type === "terminal" ? firstPane.vmMetadata?.vmId : undefined;

  if (firstVmId) {
    // Check if all panes have the same vmId
    const allHaveSameVm = nonWebviewPanes.every((pane) =>
      pane.type === "terminal" ? pane.vmMetadata?.vmId === firstVmId : false,
    );

    if (allHaveSameVm) {
      return {
        type: "vm",
        vmId: firstVmId,
      };
    }
  }

  return null;
}
