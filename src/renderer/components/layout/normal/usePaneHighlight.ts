import {
  activePaneIdAtom,
  activeTabAtom,
  applicationModeAtom,
} from "@/store/atoms";
import type { Tab } from "@/types";
import { useAtomValue } from "jotai";
import React, { useCallback, useEffect, useRef, useState } from "react";

const HIGHLIGHT_DURATION_MS = 2000;
const HIGHLIGHT_OUTLINE_WIDTH = "3px";
const HIGHLIGHT_OUTLINE_OFFSET = "-3px";

export const shouldShowPaneBorder = (
  tab: Tab,
  applicationMode: string
): boolean => {
  return Object.keys(tab.panes).length > 1 && applicationMode !== "focus";
};

type PaneHighlightOptions = {
  isResizing?: boolean;
};

export function usePaneHighlight({ isResizing = false }: PaneHighlightOptions = {}) {
  const activeTab = useAtomValue(activeTabAtom);
  const activePaneId = useAtomValue(activePaneIdAtom);
  const applicationMode = useAtomValue(applicationModeAtom);

  const [highlightedPaneId, setHighlightedPaneId] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isResizingRef = useRef(isResizing);

  const clearExistingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const triggerHighlight = useCallback(
    (paneId: string) => {
      if (!paneId) {
        return;
      }

      clearExistingTimeout();
      setHighlightedPaneId(null);

      requestAnimationFrame(() => {
        setHighlightedPaneId(paneId);

        timeoutRef.current = setTimeout(() => {
          setHighlightedPaneId((current) => (current === paneId ? null : current));
          timeoutRef.current = null;
        }, HIGHLIGHT_DURATION_MS);
      });
    },
    [clearExistingTimeout]
  );

  useEffect(() => {
    isResizingRef.current = isResizing;
  }, [isResizing]);

  const highlightActivePane = useCallback(() => {
    if (!activeTab || !activePaneId) {
      return;
    }

    if (applicationMode === "design" || isResizingRef.current) {
      return;
    }

    if (!shouldShowPaneBorder(activeTab, applicationMode)) {
      return;
    }

    triggerHighlight(activePaneId);
  }, [
    activePaneId,
    activeTab,
    applicationMode,
    triggerHighlight,
  ]);

  const getPaneHighlight = useCallback(
    (paneId: string): React.ReactNode => {
      if (paneId !== highlightedPaneId) {
        return null;
      }

      return (
        <div
          className="pointer-events-none absolute inset-0 z-20 animate-[pane-highlight_2s_ease-out_forwards]"
          style={{
            outline: `${HIGHLIGHT_OUTLINE_WIDTH} solid var(--color-blueprint)`,
            outlineOffset: HIGHLIGHT_OUTLINE_OFFSET,
          }}
        />
      );
    },
    [highlightedPaneId]
  );

  useEffect(() => {
    return () => {
      clearExistingTimeout();
    };
  }, [clearExistingTimeout]);

  useEffect(() => {
    highlightActivePane();
  }, [highlightActivePane]);

  useEffect(() => {
    const handleWindowFocus = () => {
      highlightActivePane();
    };

    window.addEventListener("focus", handleWindowFocus);
    return () => {
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [highlightActivePane]);

  return {
    getPaneHighlight,
  };
}
