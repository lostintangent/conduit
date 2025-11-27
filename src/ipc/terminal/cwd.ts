import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { SendToRendererFn, TerminalInstance } from "./types";

export const normalizeCwd = (raw: string | null): string | null => {
  if (!raw) {
    return null;
  }

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }

  const sanitized = decoded.split("\u0007").join("").trim();
  if (!sanitized) {
    return null;
  }

  try {
    return path.normalize(sanitized);
  } catch {
    return sanitized;
  }
};

const resolveProcessCwd = async (pid: number): Promise<string | null> => {
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }

  if (process.platform === "linux" || process.platform === "android") {
    try {
      const link = await fs.readlink(`/proc/${pid}/cwd`);
      return link;
    } catch {
      return null;
    }
  }

  if (process.platform === "darwin") {
    return new Promise((resolve) => {
      try {
        const proc = execFile(
          "lsof",
          ["-a", "-p", String(pid), "-d", "cwd", "-Fn"],
          (error, stdout) => {
            if (error || !stdout) {
              resolve(null);
              return;
            }

            const entry = stdout
              .split("\n")
              .map((line) => line.trim())
              .find((line) => line.startsWith("n"));
            resolve(entry ? entry.slice(1) : null);
          },
        );

        // Handle spawn errors (e.g., EBADF when file descriptors are exhausted)
        proc.on("error", (error) => {
          console.warn(
            `[Terminal CWD] Failed to spawn lsof for pid ${pid}:`,
            error.message,
          );
          resolve(null);
        });
      } catch (error) {
        console.warn(
          `[Terminal CWD] Error setting up lsof for pid ${pid}:`,
          error instanceof Error ? error.message : String(error),
        );
        resolve(null);
      }
    });
  }

  return null;
};

export const startCwdPolling = (
  session: TerminalInstance,
  sendToRenderer: SendToRendererFn,
) => {
  const MAX_CONSECUTIVE_FAILURES = 5;

  const poll = async () => {
    // Skip polling if we've backed off due to repeated failures
    if (session.cwdPollBackedOff || session.isPollingCwd) {
      return;
    }

    session.isPollingCwd = true;
    try {
      const cwd = await resolveProcessCwd(session.pty.pid);
      const normalized = normalizeCwd(cwd);
      if (normalized && normalized !== session.cwd) {
        session.cwd = normalized;
        sendToRenderer("terminal:cwd", {
          sessionId: session.id,
          cwd: session.cwd,
        });
      }
      // Success - reset failure counter
      session.cwdPollFailures = 0;
    } catch (error) {
      // Increment failure counter
      session.cwdPollFailures++;

      // Back off if we've had too many consecutive failures
      if (session.cwdPollFailures >= MAX_CONSECUTIVE_FAILURES) {
        session.cwdPollBackedOff = true;
        console.warn(
          `[Terminal CWD] Stopped polling for session ${session.id} after ${session.cwdPollFailures} consecutive failures. Will resume on OSC sequence.`,
        );

        // Stop the interval poller
        if (session.cwdPoller) {
          clearInterval(session.cwdPoller);
          session.cwdPoller = undefined;
        }
      }
    } finally {
      session.isPollingCwd = false;
    }
  };

  const schedule = (delay = 0) => {
    if (session.pendingCwdPoll) {
      clearTimeout(session.pendingCwdPoll);
    }

    session.pendingCwdPoll = setTimeout(() => {
      session.pendingCwdPoll = undefined;
      void poll();
    }, delay);
  };

  session.scheduleCwdPoll = schedule;
  schedule(0);
  session.cwdPoller = setInterval(() => {
    schedule();
  }, 500);
};
