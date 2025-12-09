import { disposeSession } from "@/components/panes/terminal/xtermCache";
import { openTabFromExistingSession } from "@/store/actions/tab";
import { hyperTerminalsAtom } from "@/store/atoms";
import { useAtom } from "jotai";
import { useCallback } from "react";

const api = window.conduit;

/**
 * Hook for managing hyper terminal (floating terminal overlay) state.
 *
 * Provides methods to:
 * - Open a new hyper terminal
 * - Close a hyper terminal
 * - Maximize a hyper terminal (move to quick pane)
 * - Move a hyper terminal to a new tab
 *
 * @returns Object with hyper terminal management methods and current state
 */
export function useHyperTerminals() {
  const [hyperTerminals, setHyperTerminals] = useAtom(hyperTerminalsAtom);

  /**
   * Opens a new hyper terminal (floating overlay).
   * Prevents duplicate terminals by checking if the terminal already exists.
   *
   * @param terminalId - The terminal session ID
   * @param paneId - The pane ID associated with this terminal
   * @param cwd - The current working directory (or null)
   */
  const openHyperTerminal = useCallback(
    (terminalId: string, paneId: string, cwd: string | null) => {
      setHyperTerminals((draft) => {
        // Prevent duplicate terminals
        if (!draft.some((t) => t.terminalId === terminalId)) {
          draft.push({ terminalId, paneId, cwd });
        }
      });
    },
    [setHyperTerminals],
  );

  /**
   * Closes a hyper terminal and cleans up its resources.
   * This will dispose of the terminal session and remove it from the state.
   *
   * @param terminalId - The terminal session ID to close
   */
  const closeHyperTerminal = useCallback(
    (terminalId: string) => {
      setHyperTerminals((draft) => {
        const index = draft.findIndex((t) => t.terminalId === terminalId);
        if (index === -1) {
          return;
        }

        const terminal = draft[index];
        api.closeTerminal(terminal.terminalId);
        disposeSession(terminal.terminalId);

        draft.splice(index, 1);
      });
    },
    [setHyperTerminals],
  );

  /**
   * Handles cleanup when a hyper terminal exits externally (e.g., process died).
   * Only disposes the session and removes from state without calling api.closeTerminal.
   *
   * @param terminalId - The terminal session ID that exited
   */
  const handleHyperTerminalExit = useCallback(
    (terminalId: string) => {
      setHyperTerminals((draft) => {
        const index = draft.findIndex((t) => t.terminalId === terminalId);
        if (index === -1) {
          return;
        }

        disposeSession(terminalId);
        draft.splice(index, 1);
      });
    },
    [setHyperTerminals],
  );

  /**
   * Maximizes a hyper terminal by moving it to the quick pane dialog.
   * Removes the terminal from the floating overlays array.
   *
   * @param terminalId - The terminal session ID to maximize
   * @param cwd - The current working directory (or null)
   * @returns An object with the terminal data for the quick pane
   */
  const maximizeHyperTerminal = useCallback(
    (terminalId: string, cwd: string | null) => {
      setHyperTerminals((draft) => {
        const index = draft.findIndex((t) => t.terminalId === terminalId);
        if (index !== -1) {
          draft.splice(index, 1);
        }
      });

      // Return the quick pane descriptor
      return {
        type: "terminal" as const,
        sessionId: terminalId,
        cwd,
      };
    },
    [setHyperTerminals],
  );

  /**
   * Moves a hyper terminal to a new tab.
   * Removes the terminal from the floating overlays array.
   *
   * @param terminalId - The terminal session ID to move
   * @param cwd - The current working directory (or null)
   */
  const moveHyperTerminalToTab = useCallback(
    async (terminalId: string, cwd: string | null) => {
      setHyperTerminals((draft) => {
        const index = draft.findIndex((t) => t.terminalId === terminalId);
        if (index !== -1) {
          draft.splice(index, 1);
        }
      });

      await openTabFromExistingSession({
        sessionId: terminalId,
        cwd,
      });
    },
    [setHyperTerminals],
  );

  return {
    hyperTerminals,
    openHyperTerminal,
    closeHyperTerminal,
    handleHyperTerminalExit,
    maximizeHyperTerminal,
    moveHyperTerminalToTab,
  };
}
