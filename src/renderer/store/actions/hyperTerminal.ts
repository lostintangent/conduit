import { disposeSession } from "@/components/panes/terminal/xtermCache";
import { openTabFromExistingSession } from "@/store/actions/tab";
import { hyperTerminalsAtom } from "@/store/atoms";
import { getDefaultStore } from "jotai";

type HyperTerminal = { terminalId: string; paneId: string; cwd: string | null };

const api = window.conduit;
const store = getDefaultStore();

/**
 * Removes a hyper terminal from the store by its terminal ID.
 *
 * @param terminalId - The terminal session ID to remove
 * @returns The removed terminal, or undefined if not found
 */
function removeHyperTerminal(terminalId: string): HyperTerminal | undefined {
  let removed: HyperTerminal | undefined;
  store.set(hyperTerminalsAtom, (terminals) => {
    const index = terminals.findIndex((t) => t.terminalId === terminalId);
    if (index !== -1) {
      removed = terminals.splice(index, 1)[0];
    }
  });
  return removed;
}

/**
 * Checks if a terminal session is a hyper terminal (floating overlay).
 *
 * @param sessionId - The terminal session ID to check
 * @returns True if the session is a hyper terminal, false otherwise
 */
export function isHyperTerminal(sessionId: string): boolean {
  return store.get(hyperTerminalsAtom).some((t) => t.terminalId === sessionId);
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
  store.set(hyperTerminalsAtom, (terminals) => {
    // Prevent duplicate terminals
    if (!terminals.some((t) => t.terminalId === terminalId)) {
      terminals.push({ terminalId, paneId, cwd });
    }
  });
}

/**
 * Closes a hyper terminal and cleans up its resources.
 * This will dispose of the terminal session and remove it from the state.
 *
 * @param terminalId - The terminal session ID to close
 */
export function closeHyperTerminal(terminalId: string) {
  const terminal = removeHyperTerminal(terminalId);
  if (!terminal) {
    return;
  }

  api.closeTerminal(terminal.terminalId);
  disposeSession(terminal.terminalId);
}

/**
 * Handles cleanup when a hyper terminal exits externally (e.g., process died).
 * Only disposes the session and removes from state without calling api.closeTerminal.
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
