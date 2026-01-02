import { useSandboxHandlers } from "@/hooks/useSandboxHandlers";
import { forwardPortAndOpen } from "@/store/actions/pane";
import { tabsAtom } from "@/store/atoms";
import { extractPortFromMatch } from "@shared/utils";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import { SandboxIndicator } from "./SandboxIndicator";

type ComputeTargetIndicatorProps = {
  paneId: string;
  hideIndividualSandboxIndicator?: boolean;
  setLinkHandler: (handler: ((url: string) => void) | null) => void;
};

/**
 * ComputeTargetIndicator handles all compute-target-specific UI and logic
 * for a terminal pane. This includes:
 * - VM and agent session indicators
 * - VM and agent session actions (fork, complete, delete)
 * - Cloud VM port forwarding link handling
 *
 * This keeps the core TerminalPane component agnostic to compute targets.
 */
export function ComputeTargetIndicator({
  paneId,
  hideIndividualSandboxIndicator = false,
  setLinkHandler,
}: ComputeTargetIndicatorProps) {
  const tabs = useAtomValue(tabsAtom);

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
  const sandboxId = terminalPane?.sandboxId ?? null;

  // Use sandbox handlers from the shared hook
  const {
    handleCompleteAgentSession: handleCompleteAgentSessionBase,
    handleDeleteAgentSession: handleDeleteAgentSessionBase,
    handleForkVM: handleForkVMBase,
  } = useSandboxHandlers({
    tabId: currentTab?.id ?? "",
    paneId,
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

  const handleForkVM = useCallback(async () => {
    if (!sandboxId || !currentTab) {
      return;
    }
    await handleForkVMBase(sandboxId);
  }, [sandboxId, currentTab, handleForkVMBase]);

  // Set up cloud VM port forwarding + link handler when in a VM
  useEffect(() => {
    if (!sandboxId) return;

    // Cloud VM - intercept localhost URLs for port forwarding
    setLinkHandler((url: string) => {
      const port = extractPortFromMatch(url);
      if (port && currentTab) {
        forwardPortAndOpen(currentTab.id, paneId, sandboxId, port);
      }
    });
  }, [sandboxId, currentTab, paneId, setLinkHandler]);

  if (hideIndividualSandboxIndicator) {
    return null;
  }

  return (
    <SandboxIndicator
      sandboxId={sandboxId}
      agentSessionId={agentSessionId}
      onCompleteAgentSession={handleCompleteAgentSession}
      onDeleteAgentSession={handleDeleteAgentSession}
      onForkVM={sandboxId ? handleForkVM : undefined}
    />
  );
}
