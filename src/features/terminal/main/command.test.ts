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
 * - lastProcessName fallback behavior
 * - Shell name filtering
 * - The foreground command in the shell's process tree, from a fake `ps`
 */
describe("captureTerminalCommand", () => {
  describe("invalid terminal state", () => {
    it("should return null if shell PID is invalid (negative)", async () => {
      const mockTerminal: TerminalInstance = {
        id: "terminal-1",
        pty: { pid: -1 } as IPty,
        cwd: "/home/user",
        lastProcessName: "bash",
        isRendererReady: true,
        bufferedOutput: "",
      };

      const result = await captureTerminalCommand(mockTerminal);
      expect(result).toBeNull();
    });

    it("should return null if shell PID is zero", async () => {
      const mockTerminal: TerminalInstance = {
        id: "terminal-1",
        pty: { pid: 0 } as IPty,
        cwd: "/home/user",
        lastProcessName: "bash",
        isRendererReady: true,
        bufferedOutput: "",
      };

      const result = await captureTerminalCommand(mockTerminal);
      expect(result).toBeNull();
    });

    it("should return null if shell PID is not an integer", async () => {
      const mockTerminal: TerminalInstance = {
        id: "terminal-1",
        pty: { pid: 1234.5 } as IPty,
        cwd: "/home/user",
        lastProcessName: "bash",
        isRendererReady: true,
        bufferedOutput: "",
      };

      const result = await captureTerminalCommand(mockTerminal);
      expect(result).toBeNull();
    });
  });

  describe("lastProcessName fallback", () => {
    it("should ignore shell names in lastProcessName", async () => {
      const shells = ["bash", "zsh", "fish", "sh", "ksh", "tcsh", "csh"];

      for (const shell of shells) {
        const mockTerminal: TerminalInstance = {
          id: "terminal-1",
          pty: { pid: -1 } as IPty, // Invalid PID to force fallback
          cwd: "/home/user",
          lastProcessName: shell,
          isRendererReady: true,
          bufferedOutput: "",
        };

        const result = await captureTerminalCommand(mockTerminal);
        expect(result).toBeNull(); // Shell names should be ignored
      }
    });

    it("should ignore empty lastProcessName", async () => {
      const mockTerminal: TerminalInstance = {
        id: "terminal-1",
        pty: { pid: -1 } as IPty,
        cwd: "/home/user",
        lastProcessName: "",
        isRendererReady: true,
        bufferedOutput: "",
      };

      const result = await captureTerminalCommand(mockTerminal);
      expect(result).toBeNull();
    });

    it("should ignore whitespace-only lastProcessName", async () => {
      const mockTerminal: TerminalInstance = {
        id: "terminal-1",
        pty: { pid: -1 } as IPty,
        cwd: "/home/user",
        lastProcessName: "   ",
        isRendererReady: true,
        bufferedOutput: "",
      };

      const result = await captureTerminalCommand(mockTerminal);
      expect(result).toBeNull();
    });

    it("should use non-shell lastProcessName when process detection fails", async () => {
      const mockTerminal: TerminalInstance = {
        id: "terminal-1",
        pty: { pid: -1 } as IPty, // Invalid PID - forces fallback
        cwd: "/home/user",
        lastProcessName: "vim",
        isRendererReady: true,
        bufferedOutput: "",
      };

      const result = await captureTerminalCommand(mockTerminal);
      expect(result).toBe("vim");
    });

    it("should use non-shell lastProcessName for common programs", async () => {
      const programs = ["npm", "node", "python", "vim", "nano", "htop", "top"];

      for (const program of programs) {
        const mockTerminal: TerminalInstance = {
          id: "terminal-1",
          pty: { pid: -1 } as IPty,
          cwd: "/home/user",
          lastProcessName: program,
          isRendererReady: true,
          bufferedOutput: "",
        };

        const result = await captureTerminalCommand(mockTerminal);
        expect(result).toBe(program);
      }
    });
  });

  describe("process introspection", () => {
    const shell = (lastProcessName = "zsh"): TerminalInstance => ({
      id: "terminal-1",
      pty: { pid: 100 } as IPty,
      cwd: "/home/user",
      lastProcessName,
      isRendererReady: true,
      bufferedOutput: "",
    });

    it("captures the shell's foreground command", async () => {
      fakePs("100 1 Ss -zsh\n200 100 S+ npm run dev\n");
      expect(await captureTerminalCommand(shell())).toBe("npm run dev");
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
