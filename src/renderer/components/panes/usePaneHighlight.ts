import { useCallback, useEffect, useRef, useState } from "react";

const HIGHLIGHT_DURATION_MS = 2000;
const HIGHLIGHT_CLASS = "animate-[pane-highlight_2s_ease-out_forwards]";

export function usePaneHighlight() {
  const [highlightedPaneId, setHighlightedPaneId] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const getHighlightClass = useCallback(
    (paneId: string): string => {
      return paneId === highlightedPaneId ? HIGHLIGHT_CLASS : "";
    },
    [highlightedPaneId]
  );

  useEffect(() => {
    return () => {
      clearExistingTimeout();
    };
  }, [clearExistingTimeout]);

  return {
    triggerHighlight,
    getHighlightClass,
  };
}
