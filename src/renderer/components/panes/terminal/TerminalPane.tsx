import { useSandboxHandlers } from "@/hooks/useSandboxHandlers";
import { exitFocusMode } from "@/store/actions/focusMode";
import { closePane, forwardPortAndOpen } from "@/store/actions/pane";
import type { ApplicationMode } from "@/store/atoms";
import { applicationModeAtom, tabsAtom, userSettingsAtom } from "@/store/atoms";
import { extractPortFromMatch } from "@shared/portDetection";
import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createFitController } from "./FitController";
import { SandboxIndicator } from "./SandboxIndicator";
import { SearchWidget, type SearchWidgetHandle } from "./SearchWidget";
import { attach, getOrCreate } from "./xtermCache";

import "@xterm/xterm/css/xterm.css";

const api = window.conduit;
const store = getDefaultStore();
type TerminalInstance = ReturnType<typeof getOrCreate>;

const registerTerminalKeyHandler = ({
  entry,
  terminalId,
  showSearchWidget,
  getApplicationMode,
  setNormalMode,
}: {
  entry: TerminalInstance;
  terminalId: string;
  showSearchWidget: () => void;
  getApplicationMode: () => ApplicationMode;
  setNormalMode: () => void;
}): (() => void) => {
  const terminal = entry.terminal;

  const keyHandler = (event: KeyboardEvent) => {
    if (event.type !== "keydown") {
      return true;
    }

    if (!terminal) {
      return true;
    }

    const isCtrlOrMeta = event.ctrlKey || event.metaKey;

    if (!isCtrlOrMeta && event.key === "Escape") {
      const mode = getApplicationMode();
      if (mode === "focus") {
        event.preventDefault();
        exitFocusMode();
        return false;
      }
      if (mode === "overview") {
        event.preventDefault();
        setNormalMode();
        return false;
      }
    }

    if (
      isCtrlOrMeta &&
      !event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === "f"
    ) {
      showSearchWidget();
      return false;
    }

    if (
      isCtrlOrMeta &&
      !event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === "c"
    ) {
      if (terminal.hasSelection()) {
        return true;
      }

      api.sendKeypress(terminalId, "\u0003");
      return false;
    }

    return true;
  };

  terminal.attachCustomKeyEventHandler(keyHandler);

  return () => {
    // xterm does not expose a direct detach API; the next attach will replace it.
  };
};

/**
 * Terminal lifecycle overview:
 *
 * 1. React renders <TerminalPane/>.
 * 2. We call getOrCreate(terminalId) to reuse or construct an xterm instance and its addons
 *    (fit/search/weblinks). The instance keeps a Ready flag so we don’t re-signal readiness later.
 * 3. attach(terminalId, container) mounts the xterm DOM into the pane.
 * 4. The fit controller owns a ResizeObserver and a single RAF-driven loop. It fits the terminal DOM
 *    to the container, resizes the PTY only when cols/rows change, and marks the session ready after
 *    the first successful fit. terminal.markReady() forwards that signal to the main process so it
 *    can flush buffered PTY output.
 * 5. As the terminal receives data it renders inside the pane; keypresses send input to the PTY via IPC.
 * 6. When the pane unmounts we dispose, removing event listeners and releasing the xterm instance.
 */

type TerminalPaneProps = {
  terminalId: string;
  isActive: boolean;
  paneId: string;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onActivate?: (event?: React.MouseEvent<HTMLDivElement>) => void;
  onLinkClick?: (url: string) => void;
  showDimensions?: boolean;
  hideIndividualSandboxIndicator?: boolean;
};

export const TerminalPane = ({
  terminalId,
  isActive,
  paneId,
  onContextMenu,
  onActivate,
  onLinkClick,
  showDimensions = true,
  hideIndividualSandboxIndicator = false,
}: TerminalPaneProps) => {
  const { showTerminalRuler } = useAtomValue(userSettingsAtom);
  const tabs = useAtomValue(tabsAtom);
  const applicationMode = useAtomValue(applicationModeAtom);
  const setApplicationMode = useSetAtom(applicationModeAtom);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<ReturnType<typeof getOrCreate> | null>(null);
  const applicationModeRef = useRef<ApplicationMode>(applicationMode);
  applicationModeRef.current = applicationMode;

  const setApplicationModeRef =
    useRef<typeof setApplicationMode>(setApplicationMode);
  setApplicationModeRef.current = setApplicationMode;
  const previousApplicationModeRef = useRef<ApplicationMode>(applicationMode);

  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const [sshConnectionState, setSSHConnectionState] = useState<
    "connecting" | "connected" | "disconnected" | null
  >(null);

  // Track if this is a cloud VM that's still being prepared
  const [isPreparingCloudVM, setIsPreparingCloudVM] = useState<boolean>(false);

  const searchWidgetRef = useRef<SearchWidgetHandle | null>(null);
  const linkHandlerRef = useRef(onLinkClick);
  linkHandlerRef.current = onLinkClick;

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

  // This component is specifically for terminal panes, so we can safely cast
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

  // Listen for SSH connection state changes
  useEffect(() => {
    const unsubscribe = api.onSSHStateChange((payload) => {
      if (payload.sessionId === terminalId) {
        console.log(`[TerminalPane] SSH state changed to: ${payload.state}`);
        setSSHConnectionState(payload.state);
        // Once we receive any SSH state, we're no longer in "preparing" phase
        setIsPreparingCloudVM(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [terminalId]);

  const focusTerminal = useCallback(
    () => requestAnimationFrame(() => terminalRef.current?.terminal.focus()),
    [],
  );

  const showSearchWidget = useCallback(() => {
    const terminal = terminalRef.current?.terminal;
    const selection = terminal?.hasSelection()
      ? terminal.getSelection().replace(/\s+/g, " ").trim()
      : "";
    searchWidgetRef.current?.show(selection ?? "");
  }, []);

  const handleClosePane = useCallback(() => {
    if (!currentTab) return;
    console.log("[TerminalPane] Closing pane");
    closePane(currentTab.id, paneId);
  }, [currentTab, paneId]);

  const handleReconnect = useCallback(async () => {
    // Create a new cloud terminal session and update this pane to use it
    try {
      console.log("[TerminalPane] Reconnecting - creating new VM session...");

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

      console.log("[TerminalPane] New session created:", result.sessionId);

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

      console.log("[TerminalPane] Pane updated with new session");

      // The component will re-render with new terminalId and show the connecting overlay
    } catch (error) {
      console.error("[TerminalPane] Failed to reconnect:", error);
      setIsPreparingCloudVM(false);
    }
  }, [currentTab, paneId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // If this is a cloud VM and we haven't received any SSH state yet, show preparing overlay
    if (vmId && sshConnectionState === null) {
      console.log(
        "[TerminalPane] Cloud VM detected, showing preparing overlay",
      );
      setIsPreparingCloudVM(true);
    }

    const terminal = getOrCreate(terminalId);
    terminalRef.current = terminal;
    attach(terminalId, container);

    const controller = createFitController({
      container,
      entry: terminal,
      setDimensions,
    });

    const detachKeyHandler = registerTerminalKeyHandler({
      entry: terminal,
      terminalId,
      showSearchWidget,
      getApplicationMode: () => applicationModeRef.current,
      setNormalMode: () => setApplicationModeRef.current("normal"),
    });

    terminal.setLinkHandler((url: string) => {
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
      const handler = linkHandlerRef.current;
      if (handler) {
        handler(url);
      } else {
        api.openExternal(url);
      }
    });

    return () => {
      detachKeyHandler();
      controller.dispose();

      terminal.setLinkHandler(null);
      terminalRef.current = null;
      searchWidgetRef.current = null;
    };
  }, []);

  // Focus the terminal when the pane becomes active
  useEffect(() => {
    if (!isActive) return;

    focusTerminal();
  }, [isActive]);

  useEffect(() => {
    if (!isActive) {
      previousApplicationModeRef.current = applicationMode;
      return;
    }

    if (applicationMode === previousApplicationModeRef.current) {
      return;
    }

    previousApplicationModeRef.current = applicationMode;

    if (applicationMode === "focus" || applicationMode === "normal") {
      focusTerminal();
    }
  }, [applicationMode, isActive, focusTerminal]);

  // Hide/show the terminal ruler based on the user
  // setting, which can be changed at any time.
  useEffect(() => {
    const terminal = terminalRef.current?.terminal;
    if (!terminal) return;

    terminal.options.overviewRulerWidth = showTerminalRuler ? 15 : 0;
  }, [showTerminalRuler]);

  return (
    <div
      className="w-full h-full flex-1 min-w-0 min-h-0 overflow-hidden relative bg-surface"
      onContextMenu={onContextMenu}
      onMouseDown={onActivate}
    >
      {/** xTerm.js container (which can't have padding applied directly to it) */}
      <div className="w-full h-full pl-2 pt-2">
        <div className="w-full h-full" ref={containerRef} />
      </div>

      <SearchWidget
        ref={searchWidgetRef}
        terminal={terminalRef.current}
        onClosed={focusTerminal}
      />

      {showDimensions && dimensions && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1000]">
          <div className="bg-black/80 text-white px-6 py-3 rounded-lg text-lg font-semibold border border-white/20 shadow-lg">
            {dimensions.width} × {dimensions.height}
          </div>
        </div>
      )}

      {!hideIndividualSandboxIndicator && (
        <SandboxIndicator
          vmId={vmId}
          agentSessionId={agentSessionId}
          onCompleteAgentSession={handleCompleteAgentSession}
          onDeleteAgentSession={handleDeleteAgentSession}
          onForkVM={vmId ? handleForkVM : undefined}
        />
      )}

      {/* SSH Connection State Overlays */}
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
    </div>
  );
};
