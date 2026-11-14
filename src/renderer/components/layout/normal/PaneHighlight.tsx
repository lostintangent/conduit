import { useUserSettings } from "@/hooks/useUserSettings";
import { activePaneIdAtom } from "@/store/atoms";
import { useSelector } from "@tanstack/react-store";
import { useCallback, useEffect, useRef, useState } from "react";

const HIGHLIGHT_DURATION_MS = 2000; // 2s - matches animation duration in index.css @keyframes pane-highlight

/**
 * Hook that manages pane highlight state and timing.
 *
 * Note: All visibility conditions (pane count, focus mode, design mode, resizing)
 * are handled by TabLayout which conditionally renders the PaneHighlight component.
 * This hook only manages when to trigger the highlight animation.
 */
function usePaneHighlight() {
  const activePaneId = useSelector(activePaneIdAtom);
  const { alwaysHighlightActivePane } = useUserSettings();

  const [highlightedPaneId, setHighlightedPaneId] = useState<string | null>(
    null,
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track the previous activePaneId to detect actual changes
  // This prevents re-triggering the highlight when pane metadata changes
  // (e.g., terminal cwd updates) but the active pane remains the same
  const previousActivePaneIdRef = useRef<string | null>(null);

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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      clearExistingTimeout();
    };
  }, [clearExistingTimeout]);

  // Trigger highlight when active pane actually changes
  useEffect(() => {
    if (activePaneId !== previousActivePaneIdRef.current) {
      previousActivePaneIdRef.current = activePaneId;
      if (activePaneId) {
        triggerHighlight(activePaneId);
      }
    }
  }, [activePaneId, triggerHighlight]);

  // Re-highlight when window receives focus
  useEffect(() => {
    const handleWindowFocus = () => {
      if (activePaneId) {
        triggerHighlight(activePaneId);
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    return () => {
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [activePaneId, triggerHighlight]);

  return highlightedPaneId;
}

type PaneHighlightProps = {
  paneId: string;
};

export function PaneHighlight({ paneId }: PaneHighlightProps) {
  const highlightedPaneId = usePaneHighlight();
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
