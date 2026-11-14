import { disposeSession } from "@features/terminal/client/xtermCache";
import { openTabFromExistingSession } from "@/store/actions/tab";
import { hyperTerminalsAtom } from "@/store/atoms";
import type { HyperTerminalPosition } from "@shared/types";
import { generateId } from "@shared/utils";
import { produce } from "immer";

const api = window.conduit;

/**
 * Removes a hyper terminal from the store by its terminal ID.
 *
 * @param terminalId - The terminal session ID to remove
 * @returns True if the terminal was found and removed, false otherwise
 */
function removeHyperTerminal(terminalId: string): boolean {
  const terminals = hyperTerminalsAtom.get();
  const exists = terminals.some((t) => t.terminalId === terminalId);

  if (!exists) {
    return false;
  }

  hyperTerminalsAtom.set(
    produce((draft) => {
      const index = draft.findIndex((t) => t.terminalId === terminalId);
      if (index !== -1) {
        draft.splice(index, 1);
      }
    }),
  );

  return true;
}

/**
 * Checks if a terminal session is a hyper terminal (floating overlay).
 *
 * @param sessionId - The terminal session ID to check
 * @returns True if the session is a hyper terminal, false otherwise
 */
export function isHyperTerminal(sessionId: string): boolean {
  return hyperTerminalsAtom.get().some((t) => t.terminalId === sessionId);
}

/**
 * Opens a new hyper terminal (floating overlay).
 * Prevents duplicate terminals by checking if the terminal already exists.
 *
 * @param terminalId - The terminal session ID
 * @param paneId - The pane ID associated with this terminal
 * @param cwd - The current working directory (or null)
 */
export function openHyperTerminal(
  terminalId: string,
  paneId: string,
  cwd: string | null,
) {
  hyperTerminalsAtom.set(
    produce((terminals) => {
      // Prevent duplicate terminals
      if (!terminals.some((t) => t.terminalId === terminalId)) {
        terminals.push({
          terminalId,
          paneId,
          cwd,
          state: "visible",
          position: null,
        });
      }
    }),
  );
}

/**
 * Starts a shell in a new hyper terminal. It has no pane to measure, so the
 * shell starts once the hyper terminal has fit.
 */
export async function createHyperTerminal(
  cwd: string | null,
  command?: string,
) {
  const result = await api.terminal.create({
    cwd: cwd ?? undefined,
    command,
    waitForSize: true,
  });
  openHyperTerminal(result.sessionId, generateId(), result.cwd ?? null);
}

/**
 * Updates the position of a hyper terminal.
 *
 * @param terminalId - The terminal session ID
 * @param position - The new position
 */
export function updateHyperTerminalPosition(
  terminalId: string,
  position: HyperTerminalPosition,
) {
  hyperTerminalsAtom.set(
    produce((terminals) => {
      const terminal = terminals.find((t) => t.terminalId === terminalId);
      if (terminal) {
        terminal.position = position;
      }
    }),
  );
}

/**
 * Minimizes a hyper terminal by setting its state to minimized.
 *
 * @param terminalId - The terminal session ID to minimize
 */
export function minimizeHyperTerminal(terminalId: string) {
  hyperTerminalsAtom.set(
    produce((terminals) => {
      const terminal = terminals.find((t) => t.terminalId === terminalId);
      if (terminal) {
        terminal.state = "minimized";
      }
    }),
  );
}

/**
 * Restores all minimized hyper terminals to visible state.
 */
export function restoreMinimizedHyperTerminals() {
  hyperTerminalsAtom.set(
    produce((terminals) => {
      for (const terminal of terminals) {
        if (terminal.state === "minimized") {
          terminal.state = "visible";
        }
      }
    }),
  );
}

/**
 * Closes a hyper terminal and cleans up its resources.
 * This will dispose of the terminal session and remove it from the state.
 *
 * @param terminalId - The terminal session ID to close
 */
export function closeHyperTerminal(terminalId: string) {
  if (!removeHyperTerminal(terminalId)) {
    return;
  }

  api.terminal.close(terminalId);
  disposeSession(terminalId);
}

/**
 * Handles cleanup when a hyper terminal exits externally (e.g., process died).
 * Only disposes the session and removes from state without calling api.terminal.close.
 *
 * @param terminalId - The terminal session ID that exited
 */
export function handleHyperTerminalExit(terminalId: string) {
  if (removeHyperTerminal(terminalId)) {
    disposeSession(terminalId);
  }
}

/**
 * Maximizes a hyper terminal by moving it to the quick pane dialog.
 * Removes the terminal from the floating overlays array.
 *
 * @param terminalId - The terminal session ID to maximize
 * @param cwd - The current working directory (or null)
 * @returns An object with the terminal data for the quick pane
 */
export function maximizeHyperTerminal(terminalId: string, cwd: string | null) {
  removeHyperTerminal(terminalId);

  // Return the quick pane descriptor
  return {
    type: "terminal" as const,
    sessionId: terminalId,
    cwd,
  };
}

/**
 * Moves a hyper terminal to a new tab.
 * Removes the terminal from the floating overlays array.
 *
 * @param terminalId - The terminal session ID to move
 * @param cwd - The current working directory (or null)
 */
export async function moveHyperTerminalToTab(
  terminalId: string,
  cwd: string | null,
) {
  removeHyperTerminal(terminalId);

  await openTabFromExistingSession({
    sessionId: terminalId,
    cwd,
  });
}
