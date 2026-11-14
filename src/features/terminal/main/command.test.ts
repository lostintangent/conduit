import { describe, it, expect } from "vitest";
import { captureTerminalCommand } from "./command";
import type { TerminalInstance } from "./types";
import type { IPty } from "node-pty";

/**
 * Unit tests for captureTerminalCommand utility.
 *
 * Note: These tests focus on the testable logic (invalid states, fallback behavior,
 * shell detection) without mocking child_process. The core process introspection
 * logic (detectActiveCommand) that uses `ps` commands is better suited for
 * integration testing or manual QA.
 *
 * What's tested:
 * - Invalid terminal states (bad PIDs)
 * - lastProcessName fallback behavior
 * - Shell name filtering
 *
 * What's not tested (requires complex mocking or integration tests):
 * - TTY detection via `ps -p <pid> -o tty=`
 * - Process tree analysis via `ps -t <tty>`
 * - Foreground process prioritization
 * - Zombie process filtering
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
        bufferedOutput: [],
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
        bufferedOutput: [],
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
        bufferedOutput: [],
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
          bufferedOutput: [],
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
        bufferedOutput: [],
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
        bufferedOutput: [],
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
        bufferedOutput: [],
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
          bufferedOutput: [],
        };

        const result = await captureTerminalCommand(mockTerminal);
        expect(result).toBe(program);
      }
    });
  });
});
