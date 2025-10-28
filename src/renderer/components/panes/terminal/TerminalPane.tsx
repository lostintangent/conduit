import { userSettingsAtom } from "@/store/atoms";
import { attach, getOrCreate, markReadyOnce } from "@/store/terminals";
import { useAtomValue } from "jotai";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createFitController, type FitController } from "./FitController";
import { SearchWidget, type SearchWidgetHandle } from "./SearchWidget";

import "@xterm/xterm/css/xterm.css";

const api = window.conduit;
type TerminalEntry = ReturnType<typeof getOrCreate>;

const registerTerminalKeyHandler = ({
  entry,
  sessionId,
  showSearchWidget,
}: {
  entry: TerminalEntry;
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

const observeContainer = (
  container: HTMLDivElement,
  onResize: () => void
): (() => void) => {
  const observer = new ResizeObserver(() => onResize());
  observer.observe(container);
  return () => observer.disconnect();
};

/**
 * Terminal lifecycle overview:
 *
 * 1. React renders <TerminalPane/>.
 * 2. We call getOrCreate(sessionId) to reuse or construct an xterm instance and its addons
 *    (fit/search/weblinks). The instance keeps a Ready flag so we don’t re-signal readiness later.
 * 3. attach(sessionId, container) mounts the xterm DOM into the pane.
 * 4. We continually fit the terminal to the container size. Once two consecutive measurements match,
 *    we mark the terminal ready. markReadyOnce(sessionId) then passes the signal to the main process via
 *    IPC, allowing it to flush any buffered PTY output. The immediate resize that follows makes sure the PTY
 *    is already sized correctly before that data arrives.
 * 5. As the terminal receives data it renders inside the pane; keypresses send input to the PTY via IPC.
 * 6. When the pane unmounts we dispose, removing event listeners and releasing the xterm instance.
 */

type TerminalPaneProps = {
  sessionId: string;
  isActive: boolean;
  paneId: string;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onActivate?: () => void;
  onLinkClick?: (url: string) => void;
  showDimensions?: boolean;
};

export const TerminalPane = ({
  sessionId,
  isActive,
  paneId,
  onContextMenu,
  onActivate,
  onLinkClick,
  showDimensions = true,
}: TerminalPaneProps) => {
  const { showTerminalRuler } = useAtomValue(userSettingsAtom);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<ReturnType<typeof getOrCreate> | null>(null);
  const controllerRef = useRef<FitController | null>(null);

  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const searchWidgetHandleRef = useRef<SearchWidgetHandle | null>(null);
  const linkHandlerRef = useRef(onLinkClick);
  linkHandlerRef.current = onLinkClick;

  const focusTerminal = useCallback(() => {
    requestAnimationFrame(() => instanceRef.current?.terminal.focus());
  }, []);

  const showSearchWidget = useCallback(() => {
    const terminal = instanceRef.current?.terminal;
    const selection = terminal?.hasSelection()
      ? terminal.getSelection().replace(/\s+/g, " ").trim()
      : "";
    searchWidgetHandleRef.current?.show(selection ?? "");
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const entry = getOrCreate(sessionId, api);
    instanceRef.current = entry;
    attach(sessionId, container);

    const controller = createFitController({
      sessionId,
      container,
      entry,
      setDimensions,
    });
    controllerRef.current = controller;

    const detachKeyHandler = registerTerminalKeyHandler({
      entry,
      sessionId,
      showSearchWidget,
    });

    const disconnectObserver = observeContainer(container, () =>
      controller.schedule()
    );

    const handleLinkClick = (url: string) => {
      const handler = linkHandlerRef.current;
      if (handler) {
        handler(url);
      } else {
        api.openExternal(url);
      }
    };
    entry.setLinkHandler(handleLinkClick);

    controller.initialize({
      markReady: () => markReadyOnce(sessionId, api),
      onReady: focusTerminal,
    });

    return () => {
      disconnectObserver();
      detachKeyHandler();

      controller.dispose();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }

      entry.setLinkHandler(null);
      instanceRef.current = null;
      searchWidgetHandleRef.current = null;
    };
  }, [sessionId]);

  // Trigger resize when active state changes
  useEffect(() => {
    if (!isActive) {
      return;
    }

    const terminal = instanceRef.current?.terminal;
    const controller = controllerRef.current;

    if (!terminal || !controller) {
      return;
    }

    requestAnimationFrame(() => {
      controller.schedule();
      terminal.focus();
    });
  }, [isActive, sessionId]);

  // Hide/show the terminal ruler based on the user
  // setting, which can be changed at any time.
  useEffect(() => {
    const terminal = instanceRef.current?.terminal;
    if (!terminal) {
      return;
    }

    const desiredWidth = showTerminalRuler ? 15 : 0;
    if (terminal.options.overviewRulerWidth !== desiredWidth) {
      terminal.options.overviewRulerWidth = desiredWidth;
    }
  }, [showTerminalRuler, sessionId]);

  return (
    <div
      className="terminal-container flex flex-1 w-full h-full p-2 min-w-0 min-h-0 overflow-hidden relative"
      ref={containerRef}
      data-active={isActive}
      onContextMenu={onContextMenu}
      onMouseDown={onActivate}
    >
      <SearchWidget
        key={sessionId}
        ref={searchWidgetHandleRef}
        terminal={instanceRef.current}
        onClosed={focusTerminal}
      />

      {showDimensions && dimensions && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1000]">
          <div className="bg-black/80 text-white px-6 py-3 rounded-lg text-lg font-semibold border border-white/20 shadow-lg">
            {dimensions.width} × {dimensions.height}
          </div>
        </div>
      )}
    </div>
  );
};
