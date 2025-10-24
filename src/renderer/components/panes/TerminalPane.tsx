import { appPreferencesAtom } from "@/store/atoms";
import { attach, getOrCreate, markReadyOnce } from "@/store/terminals";
import { useAtomValue } from "jotai";
import React, { useEffect, useRef, useState } from "react";
import { SearchWidget, type SearchWidgetHandle } from "./SearchWidget";

import "@xterm/xterm/css/xterm.css";

type TerminalPaneProps = {
  sessionId: string;
  isActive: boolean;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onActivate?: () => void;
  onLinkClick?: (url: string) => void;
};

export const TerminalPane = ({
  sessionId,
  isActive,
  onContextMenu,
  onActivate,
  onLinkClick,
}: TerminalPaneProps) => {
  const { showOverviewRuler } = useAtomValue(appPreferencesAtom);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<ReturnType<typeof getOrCreate> | null>(null);
  const fitAddonRef = useRef<ReturnType<typeof getOrCreate>["fit"] | null>(
    null
  );
  const lastSizeRef = useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const fitNowRef = useRef<() => void>(() => { });

  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchWidgetHandleRef = useRef<SearchWidgetHandle | null>(null);

  const focusTerminal = () => {
    requestAnimationFrame(() => instanceRef.current?.terminal.focus());
  };

  const showSearchWidget = () => {
    const terminal = instanceRef.current?.terminal;
    const selection = terminal?.hasSelection()
      ? terminal.getSelection().replace(/\s+/g, " ").trim()
      : "";
    searchWidgetHandleRef.current?.show(selection ?? "");
  };

  useEffect(() => {
    const api = window.conduit;
    const container = containerRef.current;

    if (!api) {
      return undefined;
    }

    if (!container) {
      return undefined;
    }

    const entry = getOrCreate(sessionId, api);
    instanceRef.current = entry;
    fitAddonRef.current = entry.fit;
    attach(sessionId, container);

    // --- Fit scheduler with rAF, exposes fitNowRef for other effects
    let rafId: number | null = null;
    const scheduleFit = () => {
      const fitAddon = fitAddonRef.current;
      const terminal = instanceRef.current?.terminal;
      if (!fitAddon || !terminal) return;

      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        const element = terminal.element as HTMLElement | null;
        if (element) {
          element.style.width = "";
          const viewport = element.querySelector(
            ".xterm-viewport"
          ) as HTMLElement | null;
          const textarea = element.querySelector(
            "textarea"
          ) as HTMLTextAreaElement | null;
          if (viewport) {
            viewport.style.width = "";
          }
          if (textarea) {
            textarea.style.width = "";
          }
        }
        // Measure the actual container size (avoid mid-layout reads)
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w === 0 || h === 0) return; // hidden/inactive pane
        const previousSize = lastSizeRef.current;
        const sizeChanged =
          w !== previousSize.width || h !== previousSize.height;

        lastSizeRef.current = { width: w, height: h };

        // Always refit even when dimensions match to accommodate font/DPR updates
        fitAddon.fit();
        api.resize(sessionId, terminal.cols, terminal.rows);

        if (sizeChanged) {
          setDimensions({ width: w, height: h });
          if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
          }
          hideTimeoutRef.current = setTimeout(() => setDimensions(null), 800);
        }
      });
    };
    // expose to other effects
    fitNowRef.current = scheduleFit;

    // Mark once per session and fit
    requestAnimationFrame(() => {
      setTimeout(() => {
        markReadyOnce(sessionId, api);
        setTimeout(() => {
          scheduleFit();
          focusTerminal();
        }, 50);
      }, 50);
    });

    const keyHandler = (event: KeyboardEvent) => {
      if (event.type !== "keydown") {
        return true;
      }

      const terminal = instanceRef.current?.terminal;

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
        if (terminal?.hasSelection()) {
          return true;
        }

        api.sendKeypress(sessionId, "\u0003");
        return false;
      }

      return true;
    };

    instanceRef.current?.terminal?.attachCustomKeyEventHandler(keyHandler);

    const resizeObservers: ResizeObserver[] = [];
    if ("ResizeObserver" in window) {
      const containerObserver = new ResizeObserver(() => scheduleFit());
      containerObserver.observe(container);
      resizeObservers.push(containerObserver);
    }

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      resizeObservers.forEach((observer) => observer.disconnect());
      fitAddonRef.current = null;
      instanceRef.current = null;
      searchWidgetHandleRef.current = null;
    };
  }, [sessionId]);

  // Trigger resize when active state changes
  useEffect(() => {
    if (!isActive) {
      return;
    }

    const api = window.conduit;
    const terminal = instanceRef.current?.terminal;
    const fitAddon = fitAddonRef.current;

    if (!api || !terminal || !fitAddon) {
      return;
    }

    requestAnimationFrame(() => {
      fitNowRef.current();
      terminal.focus();
    });
  }, [isActive, sessionId]);

  useEffect(() => {
    const api = window.conduit;
    if (!api) {
      return undefined;
    }

    const entry = getOrCreate(sessionId, api);
    entry.setLinkHandler(onLinkClick ?? null);

    return () => {
      entry.setLinkHandler(null);
    };
  }, [sessionId, onLinkClick]);

  useEffect(() => {
    const terminal = instanceRef.current?.terminal;
    if (!terminal) {
      return;
    }

    const desiredWidth = showOverviewRuler ? 15 : 0;
    if (terminal.options.overviewRulerWidth === desiredWidth) {
      return;
    }

    terminal.options.overviewRulerWidth = desiredWidth;
  }, [showOverviewRuler, sessionId]);

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

      {dimensions && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1000]">
          <div className="bg-black/80 text-white px-6 py-3 rounded-lg text-lg font-semibold border border-white/20 shadow-lg">
            {dimensions.width} × {dimensions.height}
          </div>
        </div>
      )}
    </div>
  );
};
