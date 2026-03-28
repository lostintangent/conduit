import { closePane } from "@/store/actions/pane";
import { tabsAtom } from "@/store/atoms";
import type { SSHConnectionState } from "@shared/types";
import { getDefaultStore, useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";

const api = window.conduit;
const store = getDefaultStore();

type CloudTerminalOverlayProps = {
  terminalId: string;
  paneId: string;
};

export const CloudTerminalOverlay = ({
  terminalId,
  paneId,
}: CloudTerminalOverlayProps) => {
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

  const sandboxId = terminalPane?.sandboxId ?? null;

  const [sshConnectionState, setSSHConnectionState] =
    useState<SSHConnectionState | null>(null);

  // Listen for SSH connection state changes
  useEffect(() => {
    const unsubscribe = api.onSSHStateChange((payload) => {
      if (payload.sessionId === terminalId) {
        console.log(
          `[CloudTerminalOverlay] SSH state changed to: ${payload.state}`,
        );
        setSSHConnectionState(payload.state);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [terminalId]);

  const handleClosePane = useCallback(() => {
    if (!currentTab) return;
    console.log("[CloudTerminalOverlay] Closing pane");
    closePane(currentTab.id, paneId);
  }, [currentTab, paneId]);

  const handleReconnect = useCallback(async () => {
    // Reconnect to the existing VM instead of creating a new one
    try {
      console.log(
        "[CloudTerminalOverlay] Reconnecting to existing VM:",
        sandboxId,
      );

      // Reset state
      setSSHConnectionState(null);

      // Reconnect to the existing VM
      const result = await api.createTerminal({
        existingSandboxId: sandboxId ?? undefined,
      });

      if (!result) {
        throw new Error("Failed to reconnect to VM");
      }

      console.log(
        "[CloudTerminalOverlay] Reconnected with new session:",
        result.sessionId,
      );

      // Update the pane to use the new session
      if (!currentTab) return;

      store.set(tabsAtom, (tabs) =>
        tabs.map((tab) => {
          if (tab.id !== currentTab.id) return tab;

          return {
            ...tab,
            panes: {
              ...tab.panes,
              [paneId]: {
                ...tab.panes[paneId],
                sessionId: result.sessionId,
                sandboxId: result.sandboxId ?? undefined,
                cwd: result.cwd,
                title: result.title,
              },
            },
          };
        }),
      );

      console.log(
        "[CloudTerminalOverlay] Pane updated with reconnected session",
      );
    } catch (error) {
      console.error("[CloudTerminalOverlay] Failed to reconnect:", error);
    }
  }, [currentTab, paneId, sandboxId]);

  // Don't render anything if this isn't a cloud VM
  if (!sandboxId) {
    return null;
  }

  return (
    <>
      {/* Disconnected overlay - shown when SSH connection ends */}
      {sshConnectionState === "disconnected" && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/95 z-30">
          <div className="flex flex-col items-center gap-6 max-w-md px-8">
            <div className="text-center">
              <div className="text-foreground text-xl font-semibold mb-2">
                Cloud Session Ended
              </div>
              <div className="text-foreground/70 text-sm">
                The SSH connection to the cloud workspace has been closed.
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleReconnect}
                className="px-6 py-2 bg-accent text-white rounded-md hover:bg-accent/90 transition-colors font-medium"
              >
                Reconnect
              </button>
              <button
                onClick={handleClosePane}
                className="px-6 py-2 bg-foreground/10 text-foreground rounded-md hover:bg-foreground/20 transition-colors font-medium"
              >
                Close Pane
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
