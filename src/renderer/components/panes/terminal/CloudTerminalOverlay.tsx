import { closePane } from "@/store/actions/pane";
import { tabsAtom } from "@/store/atoms";
import { getDefaultStore } from "jotai";
import { useCallback, useEffect, useState } from "react";

const api = window.conduit;
const store = getDefaultStore();

type CloudTerminalOverlayProps = {
  vmId: string | null;
  terminalId: string;
  paneId: string;
  currentTab: { id: string } | undefined;
};

export const CloudTerminalOverlay = ({
  vmId,
  terminalId,
  paneId,
  currentTab,
}: CloudTerminalOverlayProps) => {
  const [sshConnectionState, setSSHConnectionState] = useState<
    "connecting" | "connected" | "disconnected" | null
  >(null);

  // Track if this is a cloud VM that's still being prepared
  const [isPreparingCloudVM, setIsPreparingCloudVM] = useState<boolean>(false);

  // Listen for SSH connection state changes
  useEffect(() => {
    const unsubscribe = api.onSSHStateChange((payload) => {
      if (payload.sessionId === terminalId) {
        console.log(
          `[CloudTerminalOverlay] SSH state changed to: ${payload.state}`,
        );
        setSSHConnectionState(payload.state);
        // Once we receive any SSH state, we're no longer in "preparing" phase
        setIsPreparingCloudVM(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [terminalId]);

  // Set preparing state when we first detect a cloud VM
  useEffect(() => {
    if (vmId && sshConnectionState === null) {
      console.log(
        "[CloudTerminalOverlay] Cloud VM detected, showing preparing overlay",
      );
      setIsPreparingCloudVM(true);
    }
  }, [vmId, sshConnectionState]);

  const handleClosePane = useCallback(() => {
    if (!currentTab) return;
    console.log("[CloudTerminalOverlay] Closing pane");
    closePane(currentTab.id, paneId);
  }, [currentTab, paneId]);

  const handleReconnect = useCallback(async () => {
    // Create a new cloud terminal session and update this pane to use it
    try {
      console.log(
        "[CloudTerminalOverlay] Reconnecting - creating new VM session...",
      );

      // Reset state to show preparing overlay
      setSSHConnectionState(null);
      setIsPreparingCloudVM(true);

      // Create a new VM terminal session
      const result = await api.createTerminal({
        isRemoteVM: true,
      });

      if (!result) {
        throw new Error("Failed to create VM terminal");
      }

      console.log(
        "[CloudTerminalOverlay] New session created:",
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
                vmMetadata: result.vmMetadata ?? undefined,
                cwd: result.cwd,
                title: result.title,
              },
            },
          };
        }),
      );

      console.log("[CloudTerminalOverlay] Pane updated with new session");

      // The component will re-render with new terminalId and show the connecting overlay
    } catch (error) {
      console.error("[CloudTerminalOverlay] Failed to reconnect:", error);
      setIsPreparingCloudVM(false);
    }
  }, [currentTab, paneId]);

  // Don't render anything if this isn't a cloud VM
  if (!vmId) {
    return null;
  }

  return (
    <>
      {/* Preparing overlay - shown while VM is being created */}
      {isPreparingCloudVM && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/95 z-[2000]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-foreground/20 border-t-foreground rounded-full animate-spin" />
            <div className="text-foreground text-lg font-medium">
              Preparing cloud workspace...
            </div>
            <div className="text-foreground/60 text-sm">
              Creating VM and setting up environment
            </div>
          </div>
        </div>
      )}

      {/* Connecting overlay - shown while SSH is establishing connection */}
      {sshConnectionState === "connecting" && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/95 z-[2000]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-foreground/20 border-t-foreground rounded-full animate-spin" />
            <div className="text-foreground text-lg font-medium">
              Connecting to cloud workspace...
            </div>
          </div>
        </div>
      )}

      {/* Disconnected overlay - shown when SSH connection ends */}
      {sshConnectionState === "disconnected" && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/95 z-[2000]">
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
