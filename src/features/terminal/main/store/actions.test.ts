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
  acknowledgeTerminalOutput,
  createTerminal,
  killTerminal,
  markTerminalReady,
  resizeTerminal,
  setTerminalVisible,
  writeTerminal,
} from "./actions";

/** What zsh prints at a prompt, ending as its line editor takes the terminal. */
const PROMPT = "\x1b]7;file://host/work\x07~ % \x1b[K\x1b[?2004h";

function fakePty() {
  return {
    pid: 1234,
    process: "zsh",
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
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
      pty.onData.mock.calls[0][0](PROMPT);

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
    pty.onData.mock.calls[0][0](PROMPT);

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

describe("a restored terminal", () => {
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
    vi.useRealTimers();
  });

  it("runs its command at the shell's first prompt, before its tab shows", async () => {
    const { id } = await createTerminal({ command: "npm run dev" });

    // zsh reports its cwd before its line editor takes the terminal.
    output("Last login: today\r\n\x1b]7;file://host/work\x07");
    expect(pty.write).not.toHaveBeenCalled();

    output(PROMPT);
    expect(pty.write).toHaveBeenCalledWith("npm run dev\r");

    markTerminalReady(id);
    expect(pty.write).toHaveBeenCalledTimes(1);
  });

  // Typed any earlier, the terminal echoes it, then zsh draws it again.
  it("waits for the shell's first prompt when its pane shows first", async () => {
    const { id } = await createTerminal({ command: "npm run dev" });

    markTerminalReady(id);
    expect(pty.write).not.toHaveBeenCalled();

    output(PROMPT);
    output(PROMPT);
    expect(pty.write).toHaveBeenCalledTimes(1);
    expect(pty.write).toHaveBeenCalledWith("npm run dev\r");
  });

  it("types its command ahead in a shell that never reports its prompt", async () => {
    vi.useFakeTimers();
    const { id } = await createTerminal({ command: "npm run dev" });

    markTerminalReady(id);
    output("bash-3.2$ ");
    vi.advanceTimersByTime(2_999);
    expect(pty.write).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    output(PROMPT);
    expect(pty.write).toHaveBeenCalledTimes(1);
    expect(pty.write).toHaveBeenCalledWith("npm run dev\r");
  });

  it("keeps only its latest output until it shows", async () => {
    const { id } = await createTerminal({ command: "npm run dev" });

    const line = `${"x".repeat(99)}\n`;
    for (let i = 0; i < 30_000; i++) output(line);
    output("last\n");
    markTerminalReady(id);

    const sent = vi
      .mocked(emit)
      .mock.calls.filter(([event]) => event === "data");
    expect(sent).toHaveLength(1);
    const { data } = sent[0][1] as { data: string };
    expect(data.length).toBeGreaterThan(500_000);
    expect(data.length).toBeLessThanOrEqual(1_000_000);
    expect(data.startsWith("x")).toBe(true);
    expect(data.endsWith(`${line}last\n`)).toBe(true);
  });

  it("reports that its shell printed, at most every 500 ms, until it shows", async () => {
    vi.useFakeTimers();
    const { id } = await createTerminal({ command: "npm run dev" });
    const reports = () =>
      vi.mocked(emit).mock.calls.filter(([event]) => event === "activity");

    output("a");
    output("b");
    expect(reports()).toEqual([["activity", { sessionId: id }]]);

    // The rest of a burst is reported once the 500 ms are up.
    vi.advanceTimersByTime(499);
    expect(reports()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(reports()).toHaveLength(2);

    // After a quiet 500 ms, the next output is reported right away.
    vi.advanceTimersByTime(500);
    output("c");
    expect(reports()).toHaveLength(3);

    output("d");
    markTerminalReady(id);
    output("e");
    vi.advanceTimersByTime(1_000);
    expect(reports()).toHaveLength(3);
  });
});

describe("a terminal's output", () => {
  let pty: ReturnType<typeof fakePty>;
  const output = (data: string) => pty.onData.mock.calls[0][0](data);
  const sent = () =>
    vi
      .mocked(emit)
      .mock.calls.filter(([event]) => event === "data")
      .map(([, payload]) => (payload as { data: string }).data);

  beforeEach(() => {
    vi.useFakeTimers();
    pty = fakePty();
    spawnTerminalProcess.mockReset();
    spawnTerminalProcess.mockReturnValue(pty);
    vi.mocked(emit).mockReset();
  });

  afterEach(() => {
    getAllTerminals().clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sends a burst's first read right away and the rest every 5 ms as one message", async () => {
    const { id } = await createTerminal();
    markTerminalReady(id);

    output("a");
    output("b");
    output("c");
    expect(sent()).toEqual(["a"]);

    vi.advanceTimersByTime(5);
    expect(sent()).toEqual(["a", "bc"]);

    vi.advanceTimersByTime(5);
    output("d");
    expect(sent()).toEqual(["a", "bc", "d"]);
  });

  it("sends what it holds before its shell's exit", async () => {
    const { id } = await createTerminal();
    markTerminalReady(id);

    output("a");
    output("b");
    pty.onExit.mock.calls[0][0]({ exitCode: 0 });

    expect(vi.mocked(emit).mock.calls.map(([event]) => event)).toEqual([
      "data",
      "data",
      "exit",
    ]);
    expect(sent()).toEqual(["a", "b"]);
  });

  it("pauses its shell 100,000 characters ahead of the renderer until the renderer catches up", async () => {
    const { id } = await createTerminal();
    markTerminalReady(id);

    const chunk = "x".repeat(1_000);
    for (let i = 0; i < 100; i++) output(chunk);
    vi.advanceTimersByTime(5);
    expect(pty.pause).not.toHaveBeenCalled();
    output(chunk);
    vi.advanceTimersByTime(5);
    expect(pty.pause).toHaveBeenCalled();

    acknowledgeTerminalOutput(id, 96_000);
    expect(pty.resume).not.toHaveBeenCalled();
    acknowledgeTerminalOutput(id, 1_000);
    expect(pty.resume).toHaveBeenCalled();
  });

  it("holds a hidden shell's output for 250 ms, and sends it once the shell shows", async () => {
    const { id } = await createTerminal();
    markTerminalReady(id);
    setTerminalVisible(id, false);

    output("a");
    output("b");
    vi.advanceTimersByTime(249);
    expect(sent()).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(sent()).toEqual(["ab"]);

    output("c");
    vi.advanceTimersByTime(100);
    setTerminalVisible(id, true);
    expect(sent()).toEqual(["ab", "c"]);

    vi.advanceTimersByTime(5);
    output("d");
    expect(sent()).toEqual(["ab", "c", "d"]);
  });

  it("sends a hidden shell's output early once it holds 100,000 characters", async () => {
    const { id } = await createTerminal();
    markTerminalReady(id);
    setTerminalVisible(id, false);

    const chunk = "x".repeat(1_000);
    for (let i = 0; i < 99; i++) output(chunk);
    expect(sent()).toEqual([]);
    output(chunk);
    expect(sent()).toEqual(["x".repeat(100_000)]);
  });

  // node-pty closes a pty 200 ms after its shell exits, read or not.
  it("reads a paused shell's pty to the end once the shell exits", async () => {
    const kill = vi.spyOn(process, "kill").mockReturnValue(true);
    const { id } = await createTerminal();
    markTerminalReady(id);
    output("x".repeat(100_001));
    expect(pty.pause).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    expect(kill).toHaveBeenCalledWith(1234, 0);
    expect(pty.resume).not.toHaveBeenCalled();

    kill.mockImplementation(() => {
      throw Object.assign(new Error("kill ESRCH"), { code: "ESRCH" });
    });
    vi.advanceTimersByTime(50);
    expect(pty.resume).toHaveBeenCalled();

    output("x");
    vi.advanceTimersByTime(5);
    expect(pty.pause).toHaveBeenCalledTimes(1);
  });

  // node-pty's `process` asks the kernel, which cost most of main's CPU in a flood.
  it("doesn't look up the shell's foreground process for each read", async () => {
    const foreground = vi.fn(() => "zsh");
    Object.defineProperty(pty, "process", { get: foreground });
    const { id } = await createTerminal();
    markTerminalReady(id);
    foreground.mockClear();

    for (let i = 0; i < 10; i++) output("x");
    expect(foreground).not.toHaveBeenCalled();
  });

  it("counts what it kept before its pane showed once it sends it", async () => {
    const { id } = await createTerminal();
    output("x".repeat(100_001));
    expect(pty.pause).not.toHaveBeenCalled();

    markTerminalReady(id);
    expect(pty.pause).toHaveBeenCalled();
  });
});
