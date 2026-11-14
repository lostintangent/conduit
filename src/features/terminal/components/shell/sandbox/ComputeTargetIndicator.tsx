import { useSandboxHandlers } from "@/hooks/useSandboxHandlers";
import { useCallback } from "react";
import { SandboxIndicator } from "./SandboxIndicator";

type ComputeTargetIndicatorProps = {
  tabId: string;
  agentSessionId?: string;
  hideIndividualSandboxIndicator?: boolean;
};

/**
 * ComputeTargetIndicator renders the agent session indicator and its
 * actions (complete, delete) for a terminal pane.
 *
 * This keeps the core TerminalPane component agnostic to agent sessions.
 */
export function ComputeTargetIndicator({
  tabId,
  agentSessionId,
  hideIndividualSandboxIndicator = false,
}: ComputeTargetIndicatorProps) {
  // Use sandbox handlers from the shared hook
  const {
    handleCompleteAgentSession: handleCompleteAgentSessionBase,
    handleDeleteAgentSession: handleDeleteAgentSessionBase,
  } = useSandboxHandlers({ tabId });

  // Wrap the base handlers to check for required values
  const handleCompleteAgentSession = useCallback(async () => {
    if (!agentSessionId) {
      return;
    }
    await handleCompleteAgentSessionBase(agentSessionId);
  }, [agentSessionId, handleCompleteAgentSessionBase]);

  const handleDeleteAgentSession = useCallback(async () => {
    if (!agentSessionId) {
      return;
    }
    await handleDeleteAgentSessionBase(agentSessionId);
  }, [agentSessionId, handleDeleteAgentSessionBase]);

  if (hideIndividualSandboxIndicator) {
    return null;
  }

  return (
    <SandboxIndicator
      agentSessionId={agentSessionId ?? null}
      onCompleteAgentSession={handleCompleteAgentSession}
      onDeleteAgentSession={handleDeleteAgentSession}
    />
  );
}
