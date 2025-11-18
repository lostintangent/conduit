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
}: {
  entry: TerminalInstance;
  terminalId: string;
  showSearchWidget: () => void;
  togglePromptMode: () => void;
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
  cwd?: string | null;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onActivate?: (event?: React.MouseEvent<HTMLDivElement>) => void;
  onLinkClick?: (url: string) => void;
  showDimensions?: boolean;
  hideIndividualSandboxIndicator?: boolean;
  isTabSynchronized?: boolean;
};

export const TerminalPane = ({
  terminalId,
  isActive,
  paneId,
  cwd,
  onContextMenu,
  onActivate,
  onLinkClick,
  showDimensions = true,
  hideIndividualSandboxIndicator = false,
  isTabSynchronized = false,
}: TerminalPaneProps) => {
  const settings = useAtomValue(userSettingsAtom);
  const { showTerminalRuler } = settings;
  const applicationMode = useAtomValue(applicationModeAtom);
  const setApplicationMode = useSetAtom(applicationModeAtom);

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
    async (prompt: string) => {
      const agentCommand = settings.terminalPromptAgent;

      if (!agentCommand) {
        // Write error to terminal
        const terminal = terminalRef.current?.terminal;
        if (terminal) {
          terminal.writeln(
            "\r\n\x1b[31mError: No agent command configured. Please configure 'terminalPromptAgent' in settings.\x1b[0m\r",
          );
        }
        setPromptMode((prev) => ({ ...prev, isOpen: false }));
        return;
      }

      setPromptMode((prev) => ({
        ...prev,
        isProcessing: true,
      }));

      // Write the prompt to terminal
      const terminal = terminalRef.current?.terminal;
      if (terminal) {
        terminal.writeln(`\r\n\x1b[36m❯ ${prompt}\x1b[0m\r`);
      }

      // Get terminal buffer
      const buffer = getTerminalBuffer(
        terminalId,
        settings.terminalPromptBufferLines || 100,
      );

      // Construct full prompt
      const fullPrompt = constructPrompt(prompt, buffer || "", cwd || null);

      // Call IPC handler
      const response = await api.promptTerminal({
        sessionId: terminalId,
        prompt: fullPrompt,
        agentCommand,
      });

      // Write response to terminal
      if (terminal) {
        if (response.success && response.response) {
          // Convert \n to \r\n for proper terminal line breaks
          const formattedResponse = response.response.replace(/\n/g, "\r\n");
          terminal.write(`\x1b[32m${formattedResponse}\x1b[0m\r\n`);
        } else if (response.error) {
          terminal.writeln(`\x1b[31mError: ${response.error}\x1b[0m\r`);
        }
      }

      // Close prompt mode
      setPromptMode({
        isOpen: false,
        isProcessing: false,
      });
    },
    [terminalId, cwd, settings],
  );

  const handleClosePromptMode = useCallback(() => {
    setPromptMode((prev) => ({ ...prev, isOpen: false }));
  }, []);

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
      togglePromptMode: handleTogglePromptMode,
      getApplicationMode: () => applicationModeRef.current,
      setNormalMode: () => setApplicationModeRef.current("normal"),
    });

    return () => {
      detachKeyHandler();
      controller.dispose();

      linkHandlerRef.current = null;
      terminalRef.current = null;
      searchWidgetRef.current = null;
    };
  }, [handleTogglePromptMode, showSearchWidget, terminalId]);

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
        <div className="absolute top-3 right-3 z-20 pointer-events-none">
          <div className="flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wider">
            <Keyboard size={12} />
            Sync
          </div>
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
