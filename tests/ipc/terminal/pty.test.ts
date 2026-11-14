import { afterEach, describe, expect, it, vi } from "vitest";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));

vi.mock("node-pty", () => ({ spawn }));
vi.mock("electron", () => ({ app: { isPackaged: false } }));
vi.mock("../../../src/ipc/cli", () => ({
  getCliState: () => ({
    commandName: "conduit",
    cliDirectory: "/conduit/bin",
    socketPath: "/conduit/socket",
  }),
}));
vi.mock("../../../src/ipc/ui", () => ({
  getCurrentUserSettings: () => ({ terminalShell: "/bin/zsh" }),
}));

import { spawnTerminalProcess } from "../../../src/ipc/terminal/pty";

describe("spawnTerminalProcess", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    spawn.mockClear();
  });

  it("starts the shell at the size it's given", () => {
    spawnTerminalProcess("session-1", "/tmp", 132, 41);

    expect(spawn.mock.lastCall?.[2]).toMatchObject({ cols: 132, rows: 41 });
  });

  it("keeps the launching terminal's identity out of the shell", () => {
    Object.assign(process.env, {
      TERM_PROGRAM: "Apple_Terminal",
      TERM_PROGRAM_VERSION: "466",
      TERM_SESSION_ID: "7F6FD745-2A1A-45CA-925E-FCBA2143180F",
    });

    spawnTerminalProcess("session-1", "/tmp");

    const env = spawn.mock.lastCall?.[2].env;
    expect(env).not.toHaveProperty("TERM_PROGRAM");
    expect(env).not.toHaveProperty("TERM_PROGRAM_VERSION");
    expect(env).not.toHaveProperty("TERM_SESSION_ID");
    expect(env.CONDUIT_SESSION_ID).toBe("session-1");
  });
});
