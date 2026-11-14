import { setTimeout as delay } from "node:timers/promises";
import { cleanupPromptRequests } from "./prompt";
import { getAllTerminals } from "./store";
import { killTerminal } from "./store/actions";

/** Shells and prompt processes would outlive the app, so they close with it. */
export default function startTerminal() {
  return async () => {
    cleanupPromptRequests();
    await closeTerminals();
  };
}

/** How long shells get to exit on SIGHUP before quit sends SIGKILL. */
const HANGUP_GRACE_MS = 500;

/**
 * Kill every PTY and wait for its exit callback. node-pty delivers exits on a
 * native thread, and one that lands while Node is tearing down aborts the
 * process (microsoft/node-pty#904). Teardown also joins that thread, so a
 * shell that survives SIGHUP would hang quit, and those get SIGKILL.
 */
async function closeTerminals() {
  const running = new Set(getAllTerminals().values());
  const exits = Array.from(
    running,
    (terminal) =>
      new Promise<void>((resolve) =>
        terminal.pty.onExit(() => {
          running.delete(terminal);
          resolve();
        }),
      ),
  );

  await Promise.all(
    Array.from(running, (terminal) =>
      killTerminal(terminal.id).catch((error) =>
        console.error("Failed to terminate PTY session", error),
      ),
    ),
  );

  const allExited = Promise.all(exits);
  await Promise.race([allExited, delay(HANGUP_GRACE_MS)]);
  for (const terminal of running) {
    terminal.pty.kill("SIGKILL");
  }

  await allExited;
}
