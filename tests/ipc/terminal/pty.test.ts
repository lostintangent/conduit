import { describe, expect, it, vi } from "vitest";

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
  it("starts the shell at the size it's given", () => {
    spawnTerminalProcess("session-1", "/tmp", 132, 41);

    expect(spawn.mock.lastCall?.[2]).toMatchObject({ cols: 132, rows: 41 });
  });
});
