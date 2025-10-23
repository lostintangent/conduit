import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { SendToRendererFn, TerminalSession } from "./types";

// eslint-disable-next-line no-control-regex
const OSC_CWD_PATTERN = new RegExp(
  "\\u001b]7;file://[^/]*(/[^\\u0007]*)\\u0007",
  "g"
);

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
      execFile(
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
        }
      );
    });
  }

  return null;
};

export const consumeOscSequences = (
  session: TerminalSession,
  chunk: string,
  sendToRenderer: SendToRendererFn
) => {
  if (!chunk.includes("\u001b]7;")) {
    session.scheduleCwdPoll?.(150);
    if (session.oscBuffer.length > 2048) {
      session.oscBuffer = session.oscBuffer.slice(-2048);
    }
    return;
  }

  session.oscBuffer += chunk;

  OSC_CWD_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null = null;
  let lastConsumedIndex = -1;

  while ((match = OSC_CWD_PATTERN.exec(session.oscBuffer)) !== null) {
    lastConsumedIndex = OSC_CWD_PATTERN.lastIndex;
    const normalized = normalizeCwd(match[1] ?? null);
    if (normalized && normalized !== session.cwd) {
      session.cwd = normalized;
      sendToRenderer("terminal:cwd", {
        sessionId: session.id,
        cwd: session.cwd,
      });
    }
  }

  if (lastConsumedIndex >= 0) {
    session.oscBuffer = session.oscBuffer.slice(lastConsumedIndex);
  } else if (session.oscBuffer.length > 2048) {
    session.oscBuffer = session.oscBuffer.slice(-2048);
  }
};

export const startCwdPolling = (
  session: TerminalSession,
  sendToRenderer: SendToRendererFn
) => {
  const poll = async () => {
    if (session.isPollingCwd) {
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
