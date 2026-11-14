import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { spawnTerminalProcess } = vi.hoisted(() => ({
  spawnTerminalProcess: vi.fn(),
}));

vi.mock("../pty", () => ({
  spawnTerminalProcess,
  resolveShell: () => "/bin/zsh",
}));
vi.mock("../events", () => ({ emit: vi.fn() }));

import { emit } from "../events";
import { getAllTerminals } from ".";
import {
  createTerminal,
  killTerminal,
  markTerminalReady,
  resizeTerminal,
  writeTerminal,
} from "./actions";

function fakePty() {
  return {
    process: "zsh",
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  };
}

describe("a terminal that waits for its size", () => {
  let pty: ReturnType<typeof fakePty>;

  beforeEach(() => {
    pty = fakePty();
    spawnTerminalProcess.mockReset();
    spawnTerminalProcess.mockReturnValue(pty);
  });

  afterEach(() => {
    getAllTerminals().clear();
  });

  // The sizes a full-window pane fits to at these font sizes, where starting
  // at 80 columns and shrinking leaves a stray line under the first prompt.
  it.each([
    { fontSize: 24, cols: 69, rows: 24 },
    { fontSize: 32, cols: 51, rows: 17 },
  ])(
    "starts its shell at the first fit's size at $fontSize pt",
    async ({ cols, rows }) => {
      const { id } = await createTerminal({
        cwd: "/work",
        command: "npm run dev",
        waitForSize: true,
      });
      expect(spawnTerminalProcess).not.toHaveBeenCalled();

      resizeTerminal(id, cols, rows);
      markTerminalReady(id);

      expect(spawnTerminalProcess).toHaveBeenCalledTimes(1);
      expect(spawnTerminalProcess).toHaveBeenCalledWith(
        id,
        "/work",
        cols,
        rows,
      );
      expect(pty.resize).not.toHaveBeenCalled();
      expect(pty.write).toHaveBeenCalledWith("npm run dev\r");
    },
  );

  it("runs its command even if the pane is ready before it's sized", async () => {
    const { id } = await createTerminal({
      command: "npm run dev",
      waitForSize: true,
    });

    markTerminalReady(id);
    resizeTerminal(id, 69, 24);

    expect(pty.write).toHaveBeenCalledWith("npm run dev\r");
  });

  it("keeps input sent before its first fit, like an agent's command", async () => {
    const { id } = await createTerminal({ waitForSize: true });

    writeTerminal(id, "claude");
    writeTerminal(id, "\r");
    expect(pty.write).not.toHaveBeenCalled();

    resizeTerminal(id, 69, 24);

    expect(pty.write).toHaveBeenCalledTimes(1);
    expect(pty.write).toHaveBeenCalledWith("claude\r");
  });

  it("never starts a shell when closed before its first fit", async () => {
    const { id } = await createTerminal({ waitForSize: true });

    await killTerminal(id);
    resizeTerminal(id, 69, 24);

    expect(spawnTerminalProcess).not.toHaveBeenCalled();
  });
});

describe("a new terminal", () => {
  beforeEach(() => {
    spawnTerminalProcess.mockReset();
    spawnTerminalProcess.mockReturnValue(fakePty());
  });

  afterEach(() => {
    getAllTerminals().clear();
  });

  it("starts in the home directory when its cwd is empty", async () => {
    const home = process.env.HOME;
    process.env.HOME = "/Users/me";
    try {
      const { id, cwd } = await createTerminal({ cwd: "" });

      expect(cwd).toBe("/Users/me");
      expect(spawnTerminalProcess).toHaveBeenCalledWith(
        id,
        "/Users/me",
        undefined,
        undefined,
      );
    } finally {
      process.env.HOME = home;
    }
  });
});

describe("a restored terminal in a tab that hasn't shown", () => {
  let pty: ReturnType<typeof fakePty>;
  const output = (data: string) => pty.onData.mock.calls[0][0](data);

  beforeEach(() => {
    pty = fakePty();
    spawnTerminalProcess.mockReset();
    spawnTerminalProcess.mockReturnValue(pty);
    vi.mocked(emit).mockReset();
  });

  afterEach(() => {
    getAllTerminals().clear();
  });

  it("runs its command at the shell's first prompt", async () => {
    const { id } = await createTerminal({ command: "npm run dev" });

    output("Last login: today\r\n");
    expect(pty.write).not.toHaveBeenCalled();

    output("\x1b]2;zsh\x07\x1b]7;file://host/work\x07~ % ");
    expect(pty.write).toHaveBeenCalledWith("npm run dev\r");

    markTerminalReady(id);
    expect(pty.write).toHaveBeenCalledTimes(1);
  });

  it("keeps only its latest output until it shows", async () => {
    const { id } = await createTerminal({ command: "npm run dev" });

    const line = `${"x".repeat(99)}\n`;
    for (let i = 0; i < 30_000; i++) output(line);
    output("last\n");
    markTerminalReady(id);

    expect(emit).toHaveBeenCalledTimes(1);
    const { data } = vi.mocked(emit).mock.calls[0][1] as { data: string };
    expect(data.length).toBeGreaterThan(500_000);
    expect(data.length).toBeLessThanOrEqual(1_000_000);
    expect(data.startsWith("x")).toBe(true);
    expect(data.endsWith(`${line}last\n`)).toBe(true);
  });
});
