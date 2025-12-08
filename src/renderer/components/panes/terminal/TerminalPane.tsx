import { ApplicationCommands } from "@/commands/applicationCommands";
import { useCommand } from "@/commands/hooks/useCommand";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { exitFocusMode } from "@/store/actions/focusMode";
import type { ApplicationMode } from "@/store/atoms";
import { applicationModeAtom, tabsAtom, userSettingsAtom } from "@/store/atoms";
import type { TerminalPane as TerminalPaneType } from "@/types";
import { constructPrompt } from "@/utils/terminalPrompt";
import { broadcastTerminalInput } from "@/utils/terminalSync";
import { useAtomValue, useSetAtom } from "jotai";
import { Keyboard } from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AgentPanel } from "./AgentPanel";
import { CloudTerminalOverlay } from "./CloudTerminalOverlay";
import { ComputeTargetIndicator } from "./ComputeTargetIndicator";
import { createFitController } from "./FitController";
import { SearchWidget, type SearchWidgetHandle } from "./SearchWidget";
import { attach, getOrCreate, serializeSession } from "./xtermCache";

import "@xterm/xterm/css/xterm.css";

const api = window.conduit;
type TerminalInstance = ReturnType<typeof getOrCreate>;

const registerTerminalKeyHandler = ({
  entry,
  sessionId,
  showSearchWidget,
  togglePromptMode,
  getApplicationMode,
  setNormalMode,
  onSynchronizedInput,
}: {
  entry: TerminalInstance;
  sessionId: string;
  showSearchWidget: () => void;
  togglePromptMode: () => void;
  getApplicationMode: () => ApplicationMode;
  setNormalMode: () => void;
  onSynchronizedInput?: (input: string) => void;
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
      // If not in focus or overview mode, let escape go through and broadcast it
      onSynchronizedInput?.("\x1b");
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
      event.key.toLowerCase() === "p"
    ) {
      event.preventDefault();
      togglePromptMode();
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
      onSynchronizedInput?.("\u0003");
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
 * 2. We call getOrCreate(sessionId, paneId) to reuse or construct an xterm instance and its addons
 *    (fit/search/weblinks). The instance keeps a ready flag so we don’t re-signal readiness later.
 * 3. attach(paneId, container) mounts the xterm DOM into the pane.
 * 4. The fit controller owns a ResizeObserver and a single RAF-driven loop. It fits the terminal DOM
 *    to the container, resizes the PTY only when cols/rows change, and marks the session ready after
 *    the first successful fit. terminal.markReady() forwards that signal to the main process so it
 *    can flush buffered PTY output.
 * 5. As the terminal receives data it renders inside the pane; keypresses send input to the PTY via IPC.
 * 6. When the pane unmounts we dispose, removing event listeners and releasing the xterm instance.
 */

type TerminalPaneProps = {
  pane: TerminalPaneType;
  isActive: boolean;
  tabId?: string;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onActivate?: (event?: React.MouseEvent<HTMLDivElement>) => void;
  onLinkClick: (url: string) => void;
  showDimensions?: boolean;
  hideIndividualSandboxIndicator?: boolean;
  isTabSynchronized?: boolean;
  fontSize?: number;
};

export const TerminalPane = ({
  pane,
  isActive,
  tabId,
  onContextMenu,
  onActivate,
  onLinkClick,
  showDimensions = true,
  hideIndividualSandboxIndicator = false,
  isTabSynchronized = false,
  fontSize,
}: TerminalPaneProps) => {
  const { id: paneId, sessionId: terminalId, cwd, cloneOf } = pane;
  const settings = useAtomValue(userSettingsAtom);
  const tabs = useAtomValue(tabsAtom);
  const { showTerminalRuler } = settings;
  const applicationMode = useAtomValue(applicationModeAtom);
  const setApplicationMode = useSetAtom(applicationModeAtom);

  const toggleSyncCmd = useCommand(ApplicationCommands.TAB_TOGGLE_SYNCHRONIZE);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<TerminalInstance | null>(null);
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

  const [promptMode, setPromptMode] = useState<{
    isOpen: boolean;
    isProcessing: boolean;
    content: string;
    error?: string;
  }>({
    isOpen: false,
    isProcessing: false,
    content: "",
  });

  const searchWidgetRef = useRef<SearchWidgetHandle | null>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);

  const sessionId = useMemo(() => {
    if (!cloneOf || !tabId) {
      return terminalId;
    }

    const tab = tabs.find(({ id }) => id === tabId);
    const sourcePane = tab?.panes[cloneOf];

    if (sourcePane?.type === "terminal") {
      return sourcePane.sessionId;
    }

    return terminalId;
  }, [cloneOf, tabId, tabs, terminalId]);

  const handleSynchronizedInput = useCallback(
    (input: string) => {
      if (!isActive) {
        return;
      }

      broadcastTerminalInput(paneId, input);
    },
    [isActive, paneId],
  );

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

  const handleTogglePromptMode = useCallback(() => {
    setPromptMode((prev) => ({
      ...prev,
      isOpen: !prev.isOpen,
      content: "",
      error: undefined,
    }));
  }, []);

  const handlePromptSubmit = useCallback(
    async (prompt: string, requestedAgentId?: string) => {
      const agents = settings.agents || [];

      // Find the requested agent or default agent
      let selectedAgent = agents.find((a) => a.isDefault);

      if (requestedAgentId) {
        const requestedAgent = agents.find((a) => a.id === requestedAgentId);
        if (requestedAgent) {
          selectedAgent = requestedAgent;
        } else {
          // Agent not found - show error in panel
          setPromptMode((prev) => ({
            ...prev,
            error: `Agent '${requestedAgentId}' not found. Available agents: ${agents.map((a) => a.id).join(", ")}`,
          }));
          return;
        }
      }

      const agentCommand = selectedAgent?.command;

      if (!agentCommand) {
        // Show error in panel
        setPromptMode((prev) => ({
          ...prev,
          error: "No agent configured. Please configure agents in settings.",
        }));
        return;
      }

      // Clean up any existing stream listener
      if (streamCleanupRef.current) {
        streamCleanupRef.current();
        streamCleanupRef.current = null;
      }

      const agentName = selectedAgent?.name || "Agent";

      setPromptMode((prev) => ({
        ...prev,
        isProcessing: true,
        content: `❯ [${agentName}] ${prompt}\n\n`,
        error: undefined,
      }));

      // Get terminal buffer
      const buffer = serializeSession(sessionId, {
        scrollback: settings.terminalPromptBufferLines || 100,
      });

      // Construct full prompt
      const fullPrompt = constructPrompt(prompt, buffer || "", cwd || null);

      // Set up stream listener
      const removeListener = api.onPromptStream(sessionId, (chunk) => {
        if (chunk.type === "data" && chunk.data) {
          // Stream data to panel
          setPromptMode((prev) => ({
            ...prev,
            content: prev.content + chunk.data,
          }));
        } else if (chunk.type === "error" && chunk.error) {
          // Show error in panel
          setPromptMode((prev) => ({
            ...prev,
            error: chunk.error,
            isProcessing: false,
          }));
          if (streamCleanupRef.current) {
            streamCleanupRef.current();
            streamCleanupRef.current = null;
          }
        } else if (chunk.type === "end") {
          // Stream ended
          setPromptMode((prev) => ({
            ...prev,
            isProcessing: false,
          }));
          if (streamCleanupRef.current) {
            streamCleanupRef.current();
            streamCleanupRef.current = null;
          }
        }
      });

      // Store cleanup function for unmount
      streamCleanupRef.current = removeListener;

      try {
        // Call IPC handler
        const response = await api.promptTerminal({
          sessionId,
          prompt: fullPrompt,
          agentCommand,
        });

        // Handle any errors from the initial call
        if (!response.success && response.error) {
          setPromptMode((prev) => ({
            ...prev,
            error: response.error,
            isProcessing: false,
          }));
          if (streamCleanupRef.current) {
            streamCleanupRef.current();
            streamCleanupRef.current = null;
          }
        }
      } catch (error) {
        // Handle IPC call errors
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        setPromptMode((prev) => ({
          ...prev,
          error: errorMessage,
          isProcessing: false,
        }));
        if (streamCleanupRef.current) {
          streamCleanupRef.current();
          streamCleanupRef.current = null;
        }
      }
    },
    [sessionId, cwd, settings],
  );

  const handleClosePromptMode = useCallback(() => {
    setPromptMode((prev) => ({
      ...prev,
      isOpen: false,
      content: "",
      error: undefined,
    }));
    focusTerminal();
  }, [focusTerminal]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let mounted = true;
    let controller: ReturnType<typeof createFitController> | null = null;
    let detachKeyHandler: (() => void) | null = null;

    const terminal = getOrCreate(sessionId, paneId, settings);
    if (!mounted) return;

    terminalRef.current = terminal;

    // Apply custom font size if provided
    if (fontSize !== undefined) {
      terminal.terminal.options.fontSize = fontSize;
    }

    attach(paneId, container);

    controller = createFitController({
      container,
      entry: terminal,
      setDimensions,
    });

    // If font size was changed, trigger a fit after a short delay
    // to ensure the terminal has rendered with the new font size
    if (fontSize !== undefined) {
      setTimeout(() => {
        terminal.fit.fit();
      }, 0);
    }

    detachKeyHandler = registerTerminalKeyHandler({
      entry: terminal,
      sessionId,
      showSearchWidget,
      togglePromptMode: handleTogglePromptMode,
      getApplicationMode: () => applicationModeRef.current,
      setNormalMode: () => setApplicationModeRef.current("normal"),
      onSynchronizedInput: isTabSynchronized
        ? handleSynchronizedInput
        : undefined,
    });

    terminalRef.current?.setLinkHandler(onLinkClick);

    return () => {
      mounted = false;
      detachKeyHandler?.();
      controller?.dispose();

      const terminal = terminalRef.current;
      // Reset font size to default when unmounting
      if (terminal && fontSize !== undefined) {
        terminal.terminal.options.fontSize = 13;
      }

      // Clean up stream listener if active
      if (streamCleanupRef.current) {
        streamCleanupRef.current();
        streamCleanupRef.current = null;
      }

      terminalRef.current = null;
      searchWidgetRef.current = null;
    };
  }, [
    handleTogglePromptMode,
    showSearchWidget,
    sessionId,
    isTabSynchronized,
    handleSynchronizedInput,
    fontSize,
  ]);

  // Update the terminal's input handler whenever a
  // tab's synchronization state changes.
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    terminal.setInputHandler(
      isTabSynchronized ? handleSynchronizedInput : null,
    );
    return () => {
      terminal.setInputHandler(null);
    };
  }, [handleSynchronizedInput, isTabSynchronized]);

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
      className="w-full h-full flex-1 min-w-0 min-h-0 overflow-hidden relative bg-background"
      onContextMenu={onContextMenu}
      onMouseDown={onActivate}
    >
      {/** xTerm.js container (which can't have padding applied directly to it) */}
      <div className="w-full h-full pl-2 pt-2">
        <div className="w-full h-full" ref={containerRef} />
      </div>

      {isTabSynchronized && (
        <div className="absolute top-2 right-3 z-20">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSyncCmd.execute();
                }}
                className="flex rounded-full bg-elevated border-elevated-border border px-2 py-1 text-[0.65rem] hover:bg-accent"
              >
                <Keyboard size={12} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Stop synchronizing</TooltipContent>
          </Tooltip>
        </div>
      )}

      <SearchWidget
        ref={searchWidgetRef}
        terminal={terminalRef.current}
        onClosed={focusTerminal}
      />

      {showDimensions && dimensions && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1000]">
          <div className="bg-elevated px-6 py-3 rounded-lg text-lg font-semibold border border-elevated-border shadow-lg">
            {dimensions.width} × {dimensions.height}
          </div>
        </div>
      )}

      {/* Compute target UI (VM/agent indicators, cloud overlays, port forwarding) */}
      <ComputeTargetIndicator
        paneId={paneId}
        hideIndividualSandboxIndicator={hideIndividualSandboxIndicator}
        setLinkHandler={(handler) => {
          terminalRef.current?.setLinkHandler(handler);
        }}
      />

      {/* Cloud terminal SSH connection state overlays */}
      <CloudTerminalOverlay terminalId={sessionId} paneId={paneId} />

      {/* Agent Panel - floats above terminal */}
      <AgentPanel
        isOpen={promptMode.isOpen}
        onClose={handleClosePromptMode}
        onSubmit={handlePromptSubmit}
        isProcessing={promptMode.isProcessing}
        content={promptMode.content}
        error={promptMode.error}
      />
    </div>
  );
};
