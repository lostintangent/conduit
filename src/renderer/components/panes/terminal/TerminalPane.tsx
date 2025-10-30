import { enqueueNotification } from "@/store/actions/notifications";
import { completeAgentSession, deleteAgentSession } from "@/store/actions/pane";
import { tabsAtom, userSettingsAtom } from "@/store/atoms";
import { attach, getOrCreate } from "@/store/terminals";
import { useAtomValue } from "jotai";
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

const api = window.conduit;
type TerminalInstance = ReturnType<typeof getOrCreate>;

const registerTerminalKeyHandler = ({
  entry,
  sessionId,
  showSearchWidget,
}: {
  entry: TerminalInstance;
  sessionId: string;
  showSearchWidget: () => void;
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

      api.sendKeypress(sessionId, "\u0003");
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
  onActivate?: () => void;
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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<ReturnType<typeof getOrCreate> | null>(null);
  const controllerRef = useRef<{ dispose: () => void } | null>(null);

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

  const focusTerminal = useCallback(() =>
    requestAnimationFrame(() => terminalRef.current?.terminal.focus()), []);

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = getOrCreate(terminalId);
    terminalRef.current = terminal;
    attach(terminalId, container);

    controllerRef.current = createFitController({
      entry: terminal,
      container,
      setDimensions,
    });

    const detachKeyHandler = registerTerminalKeyHandler({
      entry: terminal,
      sessionId: terminalId,
      showSearchWidget,
    });

    terminal.setLinkHandler((url: string) => {
      const handler = linkHandlerRef.current;
      if (handler) {
        handler(url);
      } else {
        api.openExternal(url);
      }
    });

    return () => {
      detachKeyHandler();

      controllerRef.current.dispose();
      controllerRef.current = null;

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
        key={terminalId}
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
      />
    </div>
  );
};
