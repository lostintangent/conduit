import { quickPaneAtom } from "@/store/atoms";

const api = window.conduit;

/**
 * Starts a shell in the quick pane. It has no pane to measure, so the shell
 * starts once the quick pane has fit.
 */
export async function openQuickTerminal(cwd: string) {
  const result = await api.terminal.create({ cwd, waitForSize: true });
  quickPaneAtom.set({
    type: "terminal",
    sessionId: result.sessionId,
    cwd: result.cwd ?? null,
  });
}
