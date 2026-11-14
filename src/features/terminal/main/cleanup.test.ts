import { describe, expect, it, vi } from "vitest";
import type { TerminalInstance } from "./types";

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn(), on: vi.fn() } }));
vi.mock("./store/actions", async () => {
  const store = await import("./store");
  return {
    createTerminal: vi.fn(),
    markTerminalReady: vi.fn(),
    killTerminal: vi.fn(async (id: string) => {
      const terminal = store.getTerminal(id);
      store.removeTerminal(id);
      terminal?.pty.kill();
    }),
  };
});

import { cleanupTerminalSessions } from ".";
import { getAllTerminals, storeTerminal } from "./store";

function fakePty({ ignoresHangup = false } = {}) {
  const exitListeners: Array<() => void> = [];
  const exit = () => exitListeners.forEach((listener) => listener());
  return {
    kill: vi.fn((signal?: string) => {
      if (signal === "SIGKILL" || !ignoresHangup) setTimeout(exit, 0);
    }),
    onExit: (listener: () => void) => {
      exitListeners.push(listener);
      return { dispose: () => {} };
    },
  };
}

describe("cleanupTerminalSessions", () => {
  it("waits for every PTY to exit, sending SIGKILL to shells that ignore SIGHUP", async () => {
    const polite = fakePty();
    const stubborn = fakePty({ ignoresHangup: true });
    storeTerminal({ id: "a", pty: polite } as unknown as TerminalInstance);
    storeTerminal({ id: "b", pty: stubborn } as unknown as TerminalInstance);

    await cleanupTerminalSessions();

    expect(getAllTerminals().size).toBe(0);
    expect(polite.kill.mock.calls).toEqual([[]]);
    expect(stubborn.kill.mock.calls).toEqual([[], ["SIGKILL"]]);
  });
});
