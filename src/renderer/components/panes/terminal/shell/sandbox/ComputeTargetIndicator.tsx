import { useSandboxHandlers } from "@/hooks/useSandboxHandlers";
import { tabsAtom } from "@/store/atoms";
import { useSelector } from "@tanstack/react-store";
import { useCallback, useMemo } from "react";
import { SandboxIndicator } from "./SandboxIndicator";

type ComputeTargetIndicatorProps = {
  paneId: string;
  hideIndividualSandboxIndicator?: boolean;
};

/**
 * ComputeTargetIndicator renders the agent session indicator and its
 * actions (complete, delete) for a terminal pane.
 *
 * This keeps the core TerminalPane component agnostic to agent sessions.
 */
export function ComputeTargetIndicator({
  paneId,
  hideIndividualSandboxIndicator = false,
}: ComputeTargetIndicatorProps) {
  const tabs = useSelector(tabsAtom);

  // Memoize the current pane and tab lookup
  const { currentPane, currentTab } = useMemo(() => {
    for (const tab of tabs) {
      const pane = tab.panes[paneId];
      if (pane) {
        return { currentPane: pane, currentTab: tab };
      }
    }
    return {};
  }, [tabs, paneId]);

  // This component is specifically for terminal panes
  const terminalPane =
    currentPane?.type === "terminal" ? currentPane : undefined;

  const agentSessionId = terminalPane?.agentSessionId ?? null;

  // Use sandbox handlers from the shared hook
  const {
    handleCompleteAgentSession: handleCompleteAgentSessionBase,
    handleDeleteAgentSession: handleDeleteAgentSessionBase,
  } = useSandboxHandlers({
    tabId: currentTab?.id ?? "",
  });

  // Wrap the base handlers to check for required values
  const handleCompleteAgentSession = useCallback(async () => {
    if (!agentSessionId || !currentTab) {
      return;
    }
    await handleCompleteAgentSessionBase(agentSessionId);
  }, [agentSessionId, currentTab, handleCompleteAgentSessionBase]);

  const handleDeleteAgentSession = useCallback(async () => {
    if (!agentSessionId || !currentTab) {
      return;
    }
    await handleDeleteAgentSessionBase(agentSessionId);
  }, [agentSessionId, currentTab, handleDeleteAgentSessionBase]);

  if (hideIndividualSandboxIndicator) {
    return null;
  }

  return (
    <SandboxIndicator
      agentSessionId={agentSessionId}
      onCompleteAgentSession={handleCompleteAgentSession}
      onDeleteAgentSession={handleDeleteAgentSession}
    />
  );
}
