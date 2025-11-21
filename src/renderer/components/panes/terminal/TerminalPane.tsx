import { ApplicationCommands } from "@/commands/applicationCommands";
import { useCommand } from "@/commands/hooks/useCommand";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { exitFocusMode } from "@/store/actions/focusMode";
import type { ApplicationMode } from "@/store/atoms";
import { applicationModeAtom, userSettingsAtom } from "@/store/atoms";
import { constructPrompt } from "@/utils/terminalPrompt";
import { broadcastTerminalInput } from "@/utils/terminalSync";
import { useAtomValue, useSetAtom } from "jotai";
import { Keyboard } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { CloudTerminalOverlay } from "./CloudTerminalOverlay";
import { ComputeTargetIndicator } from "./ComputeTargetIndicator";
import { createFitController } from "./FitController";
import { PromptModeOverlay } from "./PromptModeOverlay";
import { SearchWidget, type SearchWidgetHandle } from "./SearchWidget";
import { attach, getOrCreate, getTerminalBuffer } from "./xtermCache";

import "@xterm/xterm/css/xterm.css";

const api = window.conduit;
type TerminalInstance = ReturnType<typeof getOrCreate>;

const registerTerminalKeyHandler = ({
  entry,
  terminalId,
  showSearchWidget,
  togglePromptMode,
  getApplicationMode,
  setNormalMode,
  onSynchronizedInput,
}: {
  entry: TerminalInstance;
  terminalId: string;
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

      api.sendKeypress(terminalId, "\u0003");
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
  tabId?: string;
  cwd?: string | null;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onActivate?: (event?: React.MouseEvent<HTMLDivElement>) => void;
  onLinkClick?: (url: string) => void;
  showDimensions?: boolean;
  hideIndividualSandboxIndicator?: boolean;
  isTabSynchronized?: boolean;
  fontSize?: number;
};

export const TerminalPane = ({
  terminalId,
  isActive,
  paneId,
  tabId,
  cwd,
  onContextMenu,
  onActivate,
  onLinkClick,
  showDimensions = true,
  hideIndividualSandboxIndicator = false,
  isTabSynchronized = false,
  fontSize,
}: TerminalPaneProps) => {
  const settings = useAtomValue(userSettingsAtom);
  const { showTerminalRuler } = settings;
  const applicationMode = useAtomValue(applicationModeAtom);
  const setApplicationMode = useSetAtom(applicationModeAtom);

  const toggleSyncCmd = useCommand(ApplicationCommands.TAB_TOGGLE_SYNCHRONIZE);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<ReturnType<typeof getOrCreate> | null>(null);
  const linkHandlerRef = useRef<((url: string) => void) | null>(null);
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
    response?: string;
    error?: string;
  }>({
    isOpen: false,
    isProcessing: false,
  });

  const searchWidgetRef = useRef<SearchWidgetHandle | null>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);

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
      response: undefined,
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
          // Agent not found - show error
          const terminal = terminalRef.current?.terminal;
          if (terminal) {
            terminal.writeln(
              `\r\n\x1b[31mError: Agent '${requestedAgentId}' not found. Available agents: ${agents.map((a) => a.id).join(", ")}\x1b[0m\r`,
            );
          }
          setPromptMode((prev) => ({ ...prev, isOpen: false }));
          focusTerminal();
          return;
        }
      }

      // Fallback to legacy terminalPromptAgent if no agents configured
      const agentCommand =
        selectedAgent?.command || settings.terminalPromptAgent;

      if (!agentCommand) {
        // Write error to terminal
        const terminal = terminalRef.current?.terminal;
        if (terminal) {
          terminal.writeln(
            "\r\n\x1b[31mError: No agent configured. Please configure agents in settings.\x1b[0m\r",
          );
        }
        setPromptMode((prev) => ({ ...prev, isOpen: false }));
        focusTerminal();
        return;
      }

      // Clean up any existing stream listener
      if (streamCleanupRef.current) {
        streamCleanupRef.current();
        streamCleanupRef.current = null;
      }

      setPromptMode((prev) => ({
        ...prev,
        isProcessing: true,
      }));

      // Write the prompt to terminal
      const terminal = terminalRef.current?.terminal;
      if (!terminal) {
        console.error("Terminal not available");
        setPromptMode({
          isOpen: false,
          isProcessing: false,
        });
        return;
      }

      const agentName = selectedAgent?.name || "Agent";
      terminal.writeln(`\r\n\x1b[36m❯ [${agentName}] ${prompt}\x1b[0m\r`);

      // Get terminal buffer
      const buffer = getTerminalBuffer(
        terminalId,
        settings.terminalPromptBufferLines || 100,
      );

      // Construct full prompt
      const fullPrompt = constructPrompt(prompt, buffer || "", cwd || null);

      // Set up stream listener
      const removeListener = api.onPromptStream(terminalId, (chunk) => {
        const currentTerminal = terminalRef.current?.terminal;
        if (!currentTerminal) {
          // Terminal destroyed, clean up listener
          if (streamCleanupRef.current) {
            streamCleanupRef.current();
            streamCleanupRef.current = null;
          }
          return;
        }

        if (chunk.type === "data" && chunk.data) {
          // Stream data to terminal
          const formattedData = chunk.data.replace(/\n/g, "\r\n");
          currentTerminal.write(`\x1b[32m${formattedData}\x1b[0m`);
        } else if (chunk.type === "error" && chunk.error) {
          // Write error
          currentTerminal.writeln(`\r\n\x1b[31mError: ${chunk.error}\x1b[0m\r`);
        } else if (chunk.type === "end") {
          // Stream ended
          currentTerminal.write("\r\n");
          setPromptMode({
            isOpen: false,
            isProcessing: false,
          });
          if (streamCleanupRef.current) {
            streamCleanupRef.current();
            streamCleanupRef.current = null;
          }
          focusTerminal();
        }
      });

      // Store cleanup function for unmount
      streamCleanupRef.current = removeListener;

      try {
        // Call IPC handler
        const response = await api.promptTerminal({
          sessionId: terminalId,
          prompt: fullPrompt,
          agentCommand,
        });

        // Handle any errors from the initial call
        if (!response.success && response.error) {
          const currentTerminal = terminalRef.current?.terminal;
          if (currentTerminal) {
            currentTerminal.writeln(
              `\x1b[31mError: ${response.error}\x1b[0m\r`,
            );
          }
          setPromptMode({
            isOpen: false,
            isProcessing: false,
          });
          if (streamCleanupRef.current) {
            streamCleanupRef.current();
            streamCleanupRef.current = null;
          }
          focusTerminal();
        }
      } catch (error) {
        // Handle IPC call errors
        const currentTerminal = terminalRef.current?.terminal;
        if (currentTerminal) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          currentTerminal.writeln(`\x1b[31mError: ${errorMessage}\x1b[0m\r`);
        }
        setPromptMode({
          isOpen: false,
          isProcessing: false,
        });
        if (streamCleanupRef.current) {
          streamCleanupRef.current();
          streamCleanupRef.current = null;
        }
        focusTerminal();
      }
    },
    [terminalId, cwd, settings, focusTerminal],
  );

  const handleClosePromptMode = useCallback(() => {
    setPromptMode((prev) => ({ ...prev, isOpen: false }));
    focusTerminal();
  }, [focusTerminal]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = getOrCreate(terminalId);
    terminalRef.current = terminal;

    // Apply custom font size if provided
    if (fontSize !== undefined) {
      terminal.terminal.options.fontSize = fontSize;
    }

    attach(terminalId, container);

    const controller = createFitController({
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

    const detachKeyHandler = registerTerminalKeyHandler({
      entry: terminal,
      terminalId,
      showSearchWidget,
      togglePromptMode: handleTogglePromptMode,
      getApplicationMode: () => applicationModeRef.current,
      setNormalMode: () => setApplicationModeRef.current("normal"),
      onSynchronizedInput: isTabSynchronized
        ? handleSynchronizedInput
        : undefined,
    });

    return () => {
      detachKeyHandler();
      controller.dispose();

      // Reset font size to default when unmounting
      if (fontSize !== undefined) {
        terminal.terminal.options.fontSize = 13;
      }

      // Clean up stream listener if active
      if (streamCleanupRef.current) {
        streamCleanupRef.current();
        streamCleanupRef.current = null;
      }

      linkHandlerRef.current = null;
      terminalRef.current = null;
      searchWidgetRef.current = null;
    };
  }, [
    handleTogglePromptMode,
    showSearchWidget,
    terminalId,
    isTabSynchronized,
    handleSynchronizedInput,
    fontSize,
  ]);

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
        onLinkClick={onLinkClick}
        setLinkHandler={(handler) => {
          linkHandlerRef.current = handler;
          if (terminalRef.current) {
            terminalRef.current.setLinkHandler(
              handler ||
                ((url: string) => {
                  if (onLinkClick) {
                    onLinkClick(url);
                  } else {
                    api.openExternal(url);
                  }
                }),
            );
          }
        }}
      />

      {/* Cloud terminal SSH connection state overlays */}
      <CloudTerminalOverlay terminalId={terminalId} paneId={paneId} />

      {/* Terminal Prompt Mode overlay */}
      <PromptModeOverlay
        isOpen={promptMode.isOpen}
        onClose={handleClosePromptMode}
        onSubmit={handlePromptSubmit}
        isProcessing={promptMode.isProcessing}
        response={promptMode.response}
        error={promptMode.error}
      />
    </div>
  );
};
