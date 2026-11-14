import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { spawnTerminalProcess } = vi.hoisted(() => ({
  spawnTerminalProcess: vi.fn(),
}));

vi.mock("../pty", () => ({
  spawnTerminalProcess,
  resolveShell: () => "/bin/zsh",
}));
vi.mock("../events", () => ({ emit: vi.fn() }));

import { getAllTerminals } from ".";
import {
  createTerminal,
  killTerminal,
  markTerminalReady,
  resizeTerminal,
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

  it("never starts a shell when closed before its first fit", async () => {
    const { id } = await createTerminal({ waitForSize: true });

    await killTerminal(id);
    resizeTerminal(id, 69, 24);

    expect(spawnTerminalProcess).not.toHaveBeenCalled();
  });
});
