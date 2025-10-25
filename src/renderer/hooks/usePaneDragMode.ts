import { swapPanes } from "@/store/actions/pane";
import { useEffect, useRef, useState } from "react";

type PaneDragMode = "idle" | "modifier_held" | "source_selected" | "dragging";

export type PaneDragState = {
  mode: PaneDragMode;
  sourcePane: { tabId: string; paneId: string } | null;
  targetPane: { tabId: string; paneId: string } | null;
};

const MODIFIER_HOLD_DURATION_MS = 500;

/**
 * Find the pane element and extract its pane ID and tab ID from data attributes
 */
function findPaneUnderCursor(
  x: number,
  y: number
): { tabId: string; paneId: string } | null {
  const element = document.elementFromPoint(x, y);
  if (!element) {
    return null;
  }

  // Look for the closest element with data-pane-id attribute
  const paneElement = element.closest("[data-pane-id]");
  if (!paneElement) {
    return null;
  }

  const paneId = paneElement.getAttribute("data-pane-id");
  const tabId = paneElement.getAttribute("data-tab-id");

  if (!paneId || !tabId) {
    return null;
  }

  return { tabId, paneId };
}

/**
 * Hook that manages the pane drag-and-drop state machine
 *
 * State flow:
 * IDLE → (Cmd+Alt press) → MODIFIER_HELD → (1s timer) → SOURCE_SELECTED
 *   → (mousedown) → DRAGGING → (mouseup) → swap + IDLE
 *
 * Cancel: Any state → (key release or Escape) → IDLE
 */
export function usePaneDragMode() {
  const [dragState, setDragState] = useState<PaneDragState>({
    mode: "idle",
    sourcePane: null,
    targetPane: null,
  });
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const keysHeldRef = useRef({ meta: false, alt: false });

  useEffect(() => {
    const updateBodyStyle = (mode: string) => {
      const isActive = mode === "source_selected" || mode === "dragging";
      document.body.style.userSelect = isActive ? "none" : "";
    };

    const updateDragState = (updates: Partial<PaneDragState>) => {
      setDragState((current) => ({ ...current, ...updates }));
    };

    const resetState = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setDragState({
        mode: "idle",
        sourcePane: null,
        targetPane: null,
      });
      updateBodyStyle("idle");
    };

    const isActive = () => {
      return dragState.mode === "source_selected" || dragState.mode === "dragging";
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        resetState();
        return;
      }

      const bothWereHeld = keysHeldRef.current.meta && keysHeldRef.current.alt;

      // Update key states
      if (event.key === "Meta" || event.metaKey) keysHeldRef.current.meta = true;
      if (event.key === "Alt" || event.altKey) keysHeldRef.current.alt = true;

      // Start timer when both keys become held for the first time
      if (
        !bothWereHeld &&
        keysHeldRef.current.meta &&
        keysHeldRef.current.alt &&
        dragState.mode === "idle"
      ) {
        updateDragState({ mode: "modifier_held" });

        timerRef.current = setTimeout(() => {
          setDragState((current) => {
            if (current.mode === "modifier_held") {
              updateBodyStyle("source_selected");
              return { ...current, mode: "source_selected" };
            }
            return current;
          });
        }, MODIFIER_HOLD_DURATION_MS);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      // Track key releases
      if (event.key === "Meta" || !event.metaKey) {
        keysHeldRef.current.meta = false;
      }
      if (event.key === "Alt" || !event.altKey) {
        keysHeldRef.current.alt = false;
      }

      // Reset if either key is released
      if (!keysHeldRef.current.meta || !keysHeldRef.current.alt) {
        resetState();
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!isActive()) return;

      const paneInfo = findPaneUnderCursor(event.clientX, event.clientY);

      if (dragState.mode === "source_selected") {
        updateDragState({ sourcePane: paneInfo });
      } else if (dragState.mode === "dragging") {
        const isValidTarget =
          paneInfo && paneInfo.paneId !== dragState.sourcePane?.paneId;
        updateDragState({ targetPane: isValidTarget ? paneInfo : null });
      }
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (dragState.mode === "source_selected" && dragState.sourcePane) {
        event.preventDefault();
        event.stopPropagation();
        updateDragState({ mode: "dragging" });
        updateBodyStyle("dragging");
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (dragState.mode === "dragging") {
        event.preventDefault();
        event.stopPropagation();

        // Perform swap if valid
        if (
          dragState.sourcePane &&
          dragState.targetPane &&
          dragState.sourcePane.paneId !== dragState.targetPane.paneId &&
          dragState.sourcePane.tabId === dragState.targetPane.tabId
        ) {
          swapPanes(
            dragState.sourcePane.tabId,
            dragState.sourcePane.paneId,
            dragState.targetPane.paneId
          );
        }

        resetState();
      }
    };

    // Prevent text selection and native drag during active drag mode
    const preventDefaultIfActive = (event: Event) => {
      if (isActive()) event.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousemove", handleMouseMove);
    // Use capture phase to intercept events before they reach the terminal
    window.addEventListener("mousedown", handleMouseDown, true);
    window.addEventListener("mouseup", handleMouseUp, true);
    window.addEventListener("selectstart", preventDefaultIfActive, true);
    window.addEventListener("dragstart", preventDefaultIfActive, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown, true);
      window.removeEventListener("mouseup", handleMouseUp, true);
      window.removeEventListener("selectstart", preventDefaultIfActive, true);
      window.removeEventListener("dragstart", preventDefaultIfActive, true);
      resetState();
    };
  }, [dragState]);

  return dragState;
}
