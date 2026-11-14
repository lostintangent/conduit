import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { captureTerminalCommand } from "./command";
import type { TerminalInstance } from "./types";
import type { IPty } from "node-pty";

const execFile = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFile, default: { execFile } }));

/** Answers `ps` as if `processes` ("pid ppid stat command" rows) ran on a tty. */
function fakePs(processes: string) {
  execFile.mockImplementation(
    (_file: string, args: string[], callback: Function) => {
      const stdout = args[0] === "-p" ? "ttys001\n" : processes;
      callback(null, { stdout, stderr: "" });
    },
  );
}

/**
 * Unit tests for captureTerminalCommand utility.
 *
 * What's tested:
 * - Invalid terminal states (bad PIDs)
 * - Process name fallback behavior
 * - Shell name filtering
 * - The foreground command in the shell's process tree, from a fake `ps`
 */
describe("captureTerminalCommand", () => {
  describe("invalid terminal state", () => {
    it("should return null if shell PID is invalid (negative)", async () => {
      const mockTerminal: TerminalInstance = {
        id: "terminal-1",
        pty: { pid: -1, process: "bash" } as IPty,
        cwd: "/home/user",
        isRendererReady: true,
        bufferedOutput: "",
        unacknowledged: 0,
      };

      const result = await captureTerminalCommand(mockTerminal);
      expect(result).toBeNull();
    });

    it("should return null if shell PID is zero", async () => {
      const mockTerminal: TerminalInstance = {
        id: "terminal-1",
        pty: { pid: 0, process: "bash" } as IPty,
        cwd: "/home/user",
        isRendererReady: true,
        bufferedOutput: "",
        unacknowledged: 0,
      };

      const result = await captureTerminalCommand(mockTerminal);
      expect(result).toBeNull();
    });

    it("should return null if shell PID is not an integer", async () => {
      const mockTerminal: TerminalInstance = {
        id: "terminal-1",
        pty: { pid: 1234.5, process: "bash" } as IPty,
        cwd: "/home/user",
        isRendererReady: true,
        bufferedOutput: "",
        unacknowledged: 0,
      };

      const result = await captureTerminalCommand(mockTerminal);
      expect(result).toBeNull();
    });
  });

  describe("process name fallback", () => {
    it("should ignore shell names in the process name", async () => {
      const shells = ["bash", "zsh", "fish", "sh", "ksh", "tcsh", "csh"];

      for (const shell of shells) {
        const mockTerminal: TerminalInstance = {
          id: "terminal-1",
          pty: { pid: -1, process: shell } as IPty, // Invalid PID to force fallback
          cwd: "/home/user",
          isRendererReady: true,
          bufferedOutput: "",
          unacknowledged: 0,
        };

        const result = await captureTerminalCommand(mockTerminal);
        expect(result).toBeNull(); // Shell names should be ignored
      }
    });

    it("should ignore empty process name", async () => {
      const mockTerminal: TerminalInstance = {
        id: "terminal-1",
        pty: { pid: -1, process: "" } as IPty,
        cwd: "/home/user",
        isRendererReady: true,
        bufferedOutput: "",
        unacknowledged: 0,
      };

      const result = await captureTerminalCommand(mockTerminal);
      expect(result).toBeNull();
    });

    it("should ignore whitespace-only process name", async () => {
      const mockTerminal: TerminalInstance = {
        id: "terminal-1",
        pty: { pid: -1, process: "   " } as IPty,
        cwd: "/home/user",
        isRendererReady: true,
        bufferedOutput: "",
        unacknowledged: 0,
      };

      const result = await captureTerminalCommand(mockTerminal);
      expect(result).toBeNull();
    });

    it("should use non-shell process name when process detection fails", async () => {
      const mockTerminal: TerminalInstance = {
        id: "terminal-1",
        pty: { pid: -1, process: "vim" } as IPty, // Invalid PID - forces fallback
        cwd: "/home/user",
        isRendererReady: true,
        bufferedOutput: "",
        unacknowledged: 0,
      };

      const result = await captureTerminalCommand(mockTerminal);
      expect(result).toBe("vim");
    });

    it("should use non-shell process name for common programs", async () => {
      const programs = ["npm", "node", "python", "vim", "nano", "htop", "top"];

      for (const program of programs) {
        const mockTerminal: TerminalInstance = {
          id: "terminal-1",
          pty: { pid: -1, process: program } as IPty,
          cwd: "/home/user",
          isRendererReady: true,
          bufferedOutput: "",
          unacknowledged: 0,
        };

        const result = await captureTerminalCommand(mockTerminal);
        expect(result).toBe(program);
      }
    });
  });

  describe("process introspection", () => {
    const shell = (processName = "zsh"): TerminalInstance => ({
      id: "terminal-1",
      pty: { pid: 100, process: processName } as IPty,
      cwd: "/home/user",
      isRendererReady: true,
      bufferedOutput: "",
      unacknowledged: 0,
    });

    it("captures the shell's foreground command", async () => {
      fakePs("100 1 Ss -zsh\n200 100 S+ npm run dev\n");
      expect(await captureTerminalCommand(shell())).toBe("npm run dev");
    });

    it("captures a foreground command inside a nested shell", async () => {
      fakePs("100 1 Ss -zsh\n200 100 S bash\n300 200 S+ vim notes.md\n");
      expect(await captureTerminalCommand(shell())).toBe("vim notes.md");
    });

    // A copy that replays the CLI, like `conduit duplicate`, starts a second
    // Conduit, since it runs without the launcher's ELECTRON_RUN_AS_NODE.
    it("doesn't capture the conduit CLI", async () => {
      const cli = `${process.execPath} /app/dist/main/cli.js duplicate`;
      fakePs(`100 1 Ss -zsh\n200 100 S+ ${cli}\n`);
      expect(await captureTerminalCommand(shell())).toBeNull();
    });

    it("doesn't fall back to the conduit CLI's process name", async () => {
      fakePs("100 1 Ss -zsh\n");
      const title = path.basename(process.execPath);
      expect(await captureTerminalCommand(shell(title))).toBeNull();
    });
  });
});
