import {
  dismissNotification,
  enqueueNotification,
  updateNotification,
} from "@/store/actions/notifications";
import {
  completeAgentSession,
  deleteAgentSession,
  forwardPortAndOpen,
  splitPane,
} from "@/store/actions/pane";
import { exitFocusMode } from "@/store/actions/focusMode";
import {
  applicationModeAtom,
  tabsAtom,
  userSettingsAtom,
} from "@/store/atoms";
import type { ApplicationMode } from "@/store/atoms";
import { attach, getOrCreate } from "./xtermCache";
import { extractPortFromMatch } from "@shared/portDetection";
import { useAtomValue, useSetAtom } from "jotai";
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

import "@xterm/xterm/css/xterm.css";

const api = window.conduit;
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
};

export const TerminalPane = ({
  terminalId,
  isActive,
  paneId,
  onContextMenu,
  onActivate,
  onLinkClick,
  showDimensions = true,
}: TerminalPaneProps) => {
  const { showTerminalRuler } = useAtomValue(userSettingsAtom);
  const tabs = useAtomValue(tabsAtom);
  const applicationMode = useAtomValue(applicationModeAtom);
  const setApplicationMode = useSetAtom(applicationModeAtom);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<ReturnType<typeof getOrCreate> | null>(null);
  const applicationModeRef = useRef<ApplicationMode>(applicationMode);
  applicationModeRef.current = applicationMode;

  const setApplicationModeRef = useRef<typeof setApplicationMode>(
    setApplicationMode,
  );
  setApplicationModeRef.current = setApplicationMode;
  const previousApplicationModeRef = useRef<ApplicationMode>(applicationMode);

  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

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

  const handleCompleteAgentSession = useCallback(async () => {
    if (!agentSessionId || !currentTab) {
      return;
    }

    try {
      const result = await completeAgentSession(currentTab.id, agentSessionId);
      if (!result) {
        throw new Error("Failed to complete agent session");
      }

      if (result.status === "conflict") {
        enqueueNotification({
          kind: "error",
          message: "Merge conflict",
          details: result.message,
          persistent: true,
        });
      } else {
        enqueueNotification({
          kind: "success",
          message:
            result.status === "merged"
              ? "Agent session completed"
              : "No changes to merge",
          details: result.message,
          autoCloseMs: 3000,
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      enqueueNotification({
        kind: "error",
        message: "Failed to complete agent session",
        details: errorMessage,
        autoCloseMs: 5000,
      });
      console.error("Failed to finalize agent session", error);
    }
  }, [agentSessionId, currentTab]);

  const handleDeleteAgentSession = useCallback(async () => {
    if (!agentSessionId || !currentTab) {
      return;
    }

    try {
      const result = await deleteAgentSession(currentTab.id, agentSessionId);
      if (!result) {
        throw new Error("Failed to delete agent session");
      }

      enqueueNotification({
        kind: "success",
        message: "Agent session deleted",
        details: result.message,
        autoCloseMs: 3000,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      enqueueNotification({
        kind: "error",
        message: "Failed to delete agent session",
        details: errorMessage,
        autoCloseMs: 5000,
      });
      console.error("Failed to cleanup agent session", error);
    }
  }, [agentSessionId, currentTab]);

  const handleForkVM = useCallback(async () => {
    if (!vmId || !currentTab) {
      return;
    }

    const notificationId = enqueueNotification({
      kind: "info",
      message: "Forking VM...",
      persistent: true,
    });

    try {
      // Fork the VM using the VM API
      const forkedVM = await api.forkVM(vmId);

      if (!forkedVM) {
        throw new Error("Failed to fork VM");
      }

      updateNotification(notificationId, {
        kind: "info",
        message: "Creating terminal session for forked VM...",
        persistent: true,
      });

      dismissNotification(notificationId);

      // Split the current pane vertically with the new terminal connected to forked VM
      await splitPane(currentTab.id, paneId, "row", false, {
        terminalOptions: {
          existingVMId: forkedVM.id,
        },
      });

      enqueueNotification({
        kind: "success",
        message: "VM forked successfully",
        details: `New VM: ${forkedVM.id}`,
        autoCloseMs: 3000,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      updateNotification(notificationId, {
        kind: "error",
        message: "Failed to fork VM",
        details: errorMessage,
        autoCloseMs: null,
      });
      console.error("Failed to fork VM", error);
    }
  }, [vmId, currentTab, paneId]);

  const handleShareVM = useCallback(async () => {
    if (!vmId) {
      return;
    }

    try {
      // Create a shareable message with instructions
      const shareMessage = `Connect to my cloud terminal in Conduit:\n\nVM ID: ${vmId}\n\nTo connect, use the command palette (Cmd+Shift+P) and select "Connect to Existing VM", then paste this VM ID.`;
      
      // Copy to clipboard
      await navigator.clipboard.writeText(shareMessage);
      
      enqueueNotification({
        kind: "success",
        message: "VM connection info copied to clipboard",
        details: `VM ID: ${vmId}`,
        autoCloseMs: 5000,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      enqueueNotification({
        kind: "error",
        message: "Failed to copy connection info to clipboard",
        details: errorMessage,
        autoCloseMs: 5000,
      });
      console.error("Failed to copy VM connection info", error);
    }
  }, [vmId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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
      className="w-full h-full flex-1 min-w-0 min-h-0 overflow-hidden relative"
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

      <SandboxIndicator
        vmId={vmId}
        agentSessionId={agentSessionId}
        onCompleteAgentSession={handleCompleteAgentSession}
        onDeleteAgentSession={handleDeleteAgentSession}
        onShareVM={vmId ? handleShareVM : undefined}
        onForkVM={vmId ? handleForkVM : undefined}
      />
    </div>
  );
};
