import { useSandboxHandlers } from "@/hooks/useSandboxHandlers";
import { forwardPortAndOpen, splitPane } from "@/store/actions/pane";
import { hyperTerminalsAtom, tabsAtom, userSettingsAtom } from "@/store/atoms";
import { extractPortFromMatch, generateId } from "@shared/utils";
import { useAtomValue, useSetAtom } from "jotai";
import { getDefaultStore } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import { RepoScriptsMenu } from "./RepoScriptsMenu";
import { SandboxIndicator } from "./SandboxIndicator";

const api = window.conduit;
const store = getDefaultStore();

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
  const userSettings = useAtomValue(userSettingsAtom);
  const playButtonTarget = userSettings.playButtonTarget ?? "newPane";
  const setHyperTerminals = useSetAtom(hyperTerminalsAtom);

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
  const cwd = terminalPane?.cwd;

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

  // Handler to run npm scripts
  const handleRunScript = useCallback(
    async (scriptName: string) => {
      if (!currentTab || !terminalPane) return;

      const command = `npm i && npm run ${scriptName}`;

      try {
        if (playButtonTarget === "hyper") {
          // Open in Hyper terminal
          const cwd = terminalPane.cwd || undefined;
          const result = await api.createTerminal({ cwd });
          if (!result) return;

          // Add the terminal to the hyperTerminals array
          const newPaneId = generateId();
          setHyperTerminals((draft) => {
            // Prevent duplicate terminals
            if (!draft.some((t) => t.terminalId === result.sessionId)) {
              draft.push({
                terminalId: result.sessionId,
                paneId: newPaneId,
                cwd: result.cwd ?? null,
              });
            }
          });

          // Wait for terminal to be ready
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Send the command to the Hyper terminal
          for (const char of command) {
            await api.sendKeypress(result.sessionId, char);
          }
          // Send Enter key to execute
          await api.sendKeypress(result.sessionId, "\r");
        } else {
          // Split pane to the right (row = horizontal split)
          await splitPane(currentTab.id, paneId, "row", false, {});

          // Wait a moment for the new pane to be created and ready
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Get the updated tab to find the new pane
          const tabs = store.get(tabsAtom);
          const updatedTab = tabs.find((t) => t.id === currentTab.id);
          if (!updatedTab) return;

          // Find the most recently created terminal pane (should be the one we just created)
          const terminalPanes = Object.values(updatedTab.panes).filter(
            (p) => p.type === "terminal",
          );
          const newPane = terminalPanes[terminalPanes.length - 1];
          if (!newPane || newPane.type !== "terminal") return;

          // Send npm install && npm run command to ensure packages are installed
          for (const char of command) {
            await api.sendKeypress(newPane.sessionId, char);
          }
          // Send Enter key to execute
          await api.sendKeypress(newPane.sessionId, "\r");
        }
      } catch (error) {
        console.error("Failed to run npm script:", error);
      }
    },
    [currentTab, terminalPane, paneId, playButtonTarget, setHyperTerminals],
  );

  // Set up cloud VM port forwarding + link handler when in a VM
  useEffect(() => {
    if (!vmId) return;

    // Cloud VM - intercept localhost URLs for port forwarding
    setLinkHandler((url: string) => {
      const port = extractPortFromMatch(url);
      if (port && currentTab) {
        forwardPortAndOpen(currentTab.id, paneId, vmId, port);
      }
    });
  }, [vmId, currentTab, paneId, setLinkHandler]);

  if (hideIndividualSandboxIndicator) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute top-3 right-3 flex flex-col items-end gap-2 text-white z-10">
      <SandboxIndicator
        vmId={vmId}
        agentSessionId={agentSessionId}
        onCompleteAgentSession={handleCompleteAgentSession}
        onDeleteAgentSession={handleDeleteAgentSession}
        onForkVM={vmId ? handleForkVM : undefined}
      />

      <RepoScriptsMenu cwd={cwd} onRunScript={handleRunScript} />
    </div>
  );
}
