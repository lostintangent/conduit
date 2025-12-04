import { useSandboxHandlers } from "@/hooks/useSandboxHandlers";
import { forwardPortAndOpen } from "@/store/actions/pane";
import { tabsAtom } from "@/store/atoms";
import { extractPortFromMatch } from "@shared/utils";
import { useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { SandboxIndicator } from "./SandboxIndicator";

const api = window.conduit;

type ComputeTargetIndicatorProps = {
  paneId: string;
  hideIndividualSandboxIndicator?: boolean;
  onLinkClick?: (url: string) => void;
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
  onLinkClick,
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
  const vmId = terminalPane?.vmMetadata?.vmId ?? null;

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
    if (!vmId || !currentTab) {
      return;
    }
    await handleForkVMBase(vmId);
  }, [vmId, currentTab, handleForkVMBase]);

  // Create cloud-aware link handler for port forwarding
  const cloudLinkHandler = useCallback(
    (url: string) => {
      // Check if this is a localhost/127.0.0.1 URL and we're in a cloud VM
      if (vmId) {
        const port = extractPortFromMatch(url);

        if (port && currentTab) {
          // This is a port reference in a cloud VM - forward it!
          forwardPortAndOpen(currentTab.id, paneId, vmId, port);
          return;
        }
      }

      // Otherwise, use the default link handler
      if (onLinkClick) {
        onLinkClick(url);
      } else {
        api.openExternal(url);
      }
    },
    [vmId, currentTab, paneId, onLinkClick],
  );

  // Set the link handler when vmId or dependencies change
  // This runs after the terminal is mounted and whenever vmId changes
  useMemo(() => {
    if (vmId) {
      setLinkHandler(cloudLinkHandler);
    }
    // We intentionally don't return a cleanup function here
    // The parent TerminalPane will handle cleanup in its effect
  }, [vmId, cloudLinkHandler, setLinkHandler]);

  if (hideIndividualSandboxIndicator) {
    return null;
  }

  return (
    <SandboxIndicator
      vmId={vmId}
      agentSessionId={agentSessionId}
      onCompleteAgentSession={handleCompleteAgentSession}
      onDeleteAgentSession={handleDeleteAgentSession}
      onForkVM={vmId ? handleForkVM : undefined}
    />
  );
}
