import { useUserSettings } from "@/hooks/useUserSettings";
import {
  activePaneIdAtom,
  activeTabAtom,
  applicationModeAtom,
} from "@/store/atoms";
import type { Tab } from "@/types";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";

const HIGHLIGHT_DURATION_MS = 2000; // 2s - matches animation duration in index.css @keyframes pane-highlight

export const shouldShowPaneBorder = (
  tab: Tab,
  applicationMode: string,
): boolean => {
  return Object.keys(tab.panes).length > 1 && applicationMode !== "focus";
};

type PaneHighlightOptions = {
  isResizing?: boolean;
};

function usePaneHighlight({ isResizing = false }: PaneHighlightOptions = {}) {
  const activeTab = useAtomValue(activeTabAtom);
  const activePaneId = useAtomValue(activePaneIdAtom);
  const applicationMode = useAtomValue(applicationModeAtom);
  const { alwaysHighlightActivePane } = useUserSettings();

  const [highlightedPaneId, setHighlightedPaneId] = useState<string | null>(
    null,
  );
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

        if (!alwaysHighlightActivePane) {
          timeoutRef.current = setTimeout(() => {
            setHighlightedPaneId((current) =>
              current === paneId ? null : current,
            );
            timeoutRef.current = null;
          }, HIGHLIGHT_DURATION_MS);
        }
      });
    },
    [clearExistingTimeout, alwaysHighlightActivePane],
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
  }, [activePaneId, activeTab, applicationMode, triggerHighlight]);

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

  return highlightedPaneId;
}

type PaneHighlightProps = {
  paneId: string;
  isResizing?: boolean;
};

export function PaneHighlight({
  paneId,
  isResizing = false,
}: PaneHighlightProps) {
  const highlightedPaneId = usePaneHighlight({ isResizing });
  const { alwaysHighlightActivePane } = useUserSettings();

  if (paneId !== highlightedPaneId) {
    return null;
  }

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-10 ${
        alwaysHighlightActivePane
          ? "shadow-[inset_0_0_0_3px_color-mix(in_srgb,var(--accent)_60%,transparent)]"
          : "animate-[pane-highlight_2s_ease-out_forwards]"
      }`}
    />
  );
}
