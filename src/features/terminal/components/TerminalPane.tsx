import { ApplicationCommands } from "@/commands/applicationCommands";
import { useCommand } from "@/commands/hooks/useCommand";
import { clearPressedKeys } from "@/commands/keybindings/parser";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFocusWhenActive } from "@/hooks/useFocusWhenActive";
import { useImageDrop } from "@/hooks/useImageDrop";
import {
  createHyperTerminal,
  isHyperTerminal,
} from "@/store/actions/hyperTerminal";
import { splitPane } from "@/store/actions/pane";
import type { ApplicationMode } from "@/store/atoms";
import { applicationModeAtom, userSettingsAtom } from "@/store/atoms";
import type { TerminalPane as TerminalPaneType } from "@/types";
import { constructPrompt } from "@features/terminal/client/prompt";
import { useSelector } from "@tanstack/react-store";
import { Keyboard } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AgentPanel } from "./shell/AgentPanel";
import { RepoScriptsMenu } from "./shell/RepoScriptsMenu";
import { ComputeTargetIndicator } from "./shell/sandbox/ComputeTargetIndicator";
import { SearchWidget, type SearchWidgetHandle } from "./shell/SearchWidget";
import { TerminalGitStats } from "./shell/TerminalGitStats";
import { createFitController } from "../client/fitController";
import { broadcastTerminalInput } from "../client/synchronizeInput";
import { attach, getOrCreate, serializeSession } from "../client/xtermCache";
import { pasteImage } from "./pasteImage";
import { useRuntimeTimer } from "./useRuntimeTimer";

import "@xterm/xterm/css/xterm.css";

const api = window.conduit;
type TerminalInstance = ReturnType<typeof getOrCreate>;

const registerTerminalKeyHandler = ({
  entry,
  sessionId,
  showSearchWidget,
  togglePromptMode,
  onSynchronizedInput,
}: {
  entry: TerminalInstance;
  sessionId: string;
  showSearchWidget: () => void;
  togglePromptMode: () => void;
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

    // Cmd+f / Ctrl+f: Show search widget
    if (
      isCtrlOrMeta &&
      !event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === "f"
    ) {
      event.preventDefault();
      clearPressedKeys();
      showSearchWidget();
      return false;
    }

    // Cmd+/ or Cmd+?: Toggle agent prompt mode
    if (
      isCtrlOrMeta &&
      !event.altKey &&
      (event.key === "/" || event.key === "?")
    ) {
      event.preventDefault();
      clearPressedKeys();
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

      api.terminal.input(sessionId, "\u0003");
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
  /**
   * Pre-resolved sessionId for this terminal. For cloned terminals, this should
   * be the source terminal's sessionId. Passing this from the parent avoids
   * TerminalPane needing to subscribe to all tabs just to look up clone sources.
   */
  resolvedSessionId?: string;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onActivate?: (event?: React.MouseEvent<HTMLDivElement>) => void;
  // Without a handler, links open in the default browser.
  onLinkClick?: (url: string) => void;
  showDimensions?: boolean;
  hideIndividualSandboxIndicator?: boolean;
  isTabSynchronized?: boolean;
  fontSize?: number;
};

export const TerminalPane = ({
  pane,
  isActive,
  tabId,
  resolvedSessionId,
  onContextMenu,
  onActivate,
  onLinkClick,
  showDimensions = true,
  hideIndividualSandboxIndicator = false,
  isTabSynchronized = false,
  fontSize,
}: TerminalPaneProps) => {
  const { id: paneId, sessionId: terminalId, cwd } = pane;
  const settings = useSelector(userSettingsAtom);
  const { showTerminalRuler } = settings;
  const playButtonTarget = settings.playButtonTarget ?? "newPane";
  const applicationMode = useSelector(applicationModeAtom);
  const setApplicationMode = applicationModeAtom.set;

  const toggleSyncCmd = useCommand(ApplicationCommands.TAB_TOGGLE_SYNCHRONIZE);

  const paneRef = useRef<HTMLDivElement | null>(null);
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
    conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  }>({
    isOpen: false,
    isProcessing: false,
    content: "",
    conversationHistory: [],
  });

  const searchWidgetRef = useRef<SearchWidgetHandle | null>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);

  // Use pre-resolved sessionId from parent (handles clone lookup), fall back to pane's own sessionId
  const sessionId = resolvedSessionId ?? terminalId;

  const { isImageDragOver, dragHandlers: imageDragHandlers } = useImageDrop({
    enabled: applicationMode === "normal",
    onImageDrop: (file) => pasteImage(sessionId, file),
  });

  const { display: runtimeDisplay, isRunning: isRuntimeRunning } =
    useRuntimeTimer({
      sessionId,
      enabled: isTabSynchronized,
    });

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
      // Don't reset content or conversationHistory - keep the chat history
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

      // Append user message to display
      setPromptMode((prev) => ({
        ...prev,
        isProcessing: true,
        content: prev.content + `\n❯ [You] ${prompt}\n\n[${agentName}] `,
        error: undefined,
      }));

      // Get terminal buffer
      const buffer = serializeSession(sessionId, {
        scrollback: settings.terminalPromptBufferLines || 100,
      });

      // Construct full prompt with conversation history
      const fullPrompt = constructPrompt(
        prompt,
        buffer || "",
        cwd || null,
        promptMode.conversationHistory,
      );

      // Track the assistant's response
      let assistantResponse = "";

      // Set up stream listener
      const removeListener = api.terminal.on("promptStream", (payload) => {
        if (payload.sessionId !== sessionId) return;
        const { chunk } = payload;
        if (chunk.type === "data" && chunk.data) {
          assistantResponse += chunk.data;
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
          // Stream ended - add to conversation history
          setPromptMode((prev) => ({
            ...prev,
            isProcessing: false,
            conversationHistory: [
              ...prev.conversationHistory,
              { role: "user", content: prompt },
              { role: "assistant", content: assistantResponse },
            ],
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
        const response = await api.terminal.prompt({
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
    [sessionId, cwd, settings, promptMode.conversationHistory],
  );

  const handleClosePromptMode = useCallback(() => {
    setPromptMode((prev) => ({
      ...prev,
      isOpen: false,
      // Keep content and conversationHistory - don't reset
      error: undefined,
    }));
    focusTerminal();
  }, [focusTerminal]);

  const handleClearPromptHistory = useCallback(() => {
    setPromptMode((prev) => ({
      ...prev,
      content: "",
      conversationHistory: [],
      error: undefined,
    }));
  }, []);

  const handleRunScript = useCallback(
    async (scriptName: string) => {
      if (!tabId) return;

      const command = `npm i && npm run ${scriptName}`;

      if (playButtonTarget === "hyper") {
        await createHyperTerminal(cwd, command);
      } else {
        await splitPane(tabId, paneId, "row", false, {
          terminalOptions: { cwd: cwd ?? undefined, command },
        });
      }
    },
    [tabId, cwd, paneId, playButtonTarget],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let controller: ReturnType<typeof createFitController> | null = null;
    let detachKeyHandler: (() => void) | null = null;

    const terminal = getOrCreate(sessionId, paneId, settings);

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
      onSynchronizedInput: isTabSynchronized
        ? handleSynchronizedInput
        : undefined,
    });

    terminalRef.current?.setLinkHandler(onLinkClick ?? null);

    return () => {
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

  useFocusWhenActive(isActive, paneRef, () =>
    terminalRef.current?.terminal.focus(),
  );

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

    terminal.options.overviewRuler = showTerminalRuler ? { width: 15 } : {};
  }, [showTerminalRuler]);

  return (
    <div
      ref={paneRef}
      className="group w-full h-full flex-1 min-w-0 min-h-0 overflow-hidden relative bg-background"
      onContextMenu={onContextMenu}
      onMouseDown={onActivate}
      {...imageDragHandlers}
    >
      {/* Image drop overlay */}
      {isImageDragOver && (
        <div className="pointer-events-none absolute inset-0 z-[35] bg-accent/40" />
      )}

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
                className="flex items-center gap-1.5 rounded-full bg-elevated border-elevated-border border px-2 py-1 text-[0.65rem] hover:bg-accent"
              >
                <Keyboard size={12} />
                {runtimeDisplay && (
                  <span
                    className={`font-mono tabular-nums ${isRuntimeRunning ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {runtimeDisplay}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>Stop synchronizing</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Git stats badge (top-right, pinned) - only show when in a tab (not hyper terminal or quick pane) */}
      {tabId && <TerminalGitStats cwd={cwd} />}

      <SearchWidget
        ref={searchWidgetRef}
        terminal={terminalRef.current}
        onClosed={focusTerminal}
      />

      {showDimensions && dimensions && !isHyperTerminal(terminalId) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <div className="bg-elevated px-6 py-3 rounded-lg text-lg font-semibold border border-elevated-border shadow-lg">
            {dimensions.width} × {dimensions.height}
          </div>
        </div>
      )}

      {/* Agent session indicator */}
      <ComputeTargetIndicator
        paneId={paneId}
        hideIndividualSandboxIndicator={hideIndividualSandboxIndicator}
      />

      {/* Repository scripts menu */}
      <div className="pointer-events-auto absolute top-3 right-3 flex flex-col items-end gap-2 text-white z-50">
        <RepoScriptsMenu cwd={cwd} onRunScript={handleRunScript} />
      </div>

      {/* Agent Panel - floats above terminal */}
      <AgentPanel
        isOpen={promptMode.isOpen}
        onClose={handleClosePromptMode}
        onSubmit={handlePromptSubmit}
        onClearHistory={handleClearPromptHistory}
        isProcessing={promptMode.isProcessing}
        content={promptMode.content}
        error={promptMode.error}
      />
    </div>
  );
};
