/**
 * Unit tests for PreCommandRegistry
 */

import { PreCommandRegistry } from "@/commands/preCommands/registry";
import type {
  PreCommand,
  PreCommandResult,
  TerminalConfig,
} from "@/commands/preCommands/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("PreCommandRegistry", () => {
  let registry: PreCommandRegistry;

  beforeEach(() => {
    // Get fresh registry instance and clear it
    registry = PreCommandRegistry.getInstance();
    registry.clear();
  });

  describe("getInstance", () => {
    it("should return a singleton instance", () => {
      const instance1 = PreCommandRegistry.getInstance();
      const instance2 = PreCommandRegistry.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("should return the same instance across multiple calls", () => {
      const instances = Array(5)
        .fill(null)
        .map(() => PreCommandRegistry.getInstance());

      // All instances should be the same reference
      instances.forEach((instance) => {
        expect(instance).toBe(instances[0]);
      });
    });
  });

  describe("register", () => {
    it("should register a pre-command", () => {
      const preCommand: PreCommand = {
        id: "test-command",
        label: "Test Command",
        run: async () => ({ success: true }),
      };

      registry.register(preCommand);

      const retrieved = registry.get("test-command");
      expect(retrieved).toBe(preCommand);
    });

    it("should register multiple pre-commands", () => {
      const command1: PreCommand = {
        id: "command-1",
        label: "Command 1",
        run: async () => ({ success: true }),
      };

      const command2: PreCommand = {
        id: "command-2",
        label: "Command 2",
        run: async () => ({ success: true }),
      };

      registry.register(command1);
      registry.register(command2);

      expect(registry.get("command-1")).toBe(command1);
      expect(registry.get("command-2")).toBe(command2);
    });

    it("should allow overwriting an existing pre-command", () => {
      const command1: PreCommand = {
        id: "test-command",
        label: "First Version",
        run: async () => ({ success: true }),
      };

      const command2: PreCommand = {
        id: "test-command",
        label: "Second Version",
        run: async () => ({ success: false }),
      };

      registry.register(command1);
      registry.register(command2);

      const retrieved = registry.get("test-command");
      expect(retrieved).toBe(command2);
      expect(retrieved?.label).toBe("Second Version");
    });

    it("should register pre-command with description", () => {
      const preCommand: PreCommand = {
        id: "test-command",
        label: "Test Command",
        description: "This is a test command",
        run: async () => ({ success: true }),
      };

      registry.register(preCommand);

      const retrieved = registry.get("test-command");
      expect(retrieved?.description).toBe("This is a test command");
    });
  });

  describe("get", () => {
    it("should return undefined for non-existent command", () => {
      const retrieved = registry.get("non-existent");
      expect(retrieved).toBeUndefined();
    });

    it("should return the registered command", () => {
      const preCommand: PreCommand = {
        id: "test-command",
        label: "Test Command",
        run: async () => ({ success: true }),
      };

      registry.register(preCommand);

      const retrieved = registry.get("test-command");
      expect(retrieved).toBe(preCommand);
    });

    it("should return undefined after command is cleared", () => {
      const preCommand: PreCommand = {
        id: "test-command",
        label: "Test Command",
        run: async () => ({ success: true }),
      };

      registry.register(preCommand);
      registry.clear();

      const retrieved = registry.get("test-command");
      expect(retrieved).toBeUndefined();
    });
  });

  describe("getAll", () => {
    it("should return empty array when no commands registered", () => {
      const commands = registry.getAll();
      expect(commands).toEqual([]);
    });

    it("should return all registered commands", () => {
      const command1: PreCommand = {
        id: "command-1",
        label: "Command 1",
        run: async () => ({ success: true }),
      };

      const command2: PreCommand = {
        id: "command-2",
        label: "Command 2",
        run: async () => ({ success: true }),
      };

      registry.register(command1);
      registry.register(command2);

      const commands = registry.getAll();
      expect(commands).toHaveLength(2);
      expect(commands).toContain(command1);
      expect(commands).toContain(command2);
    });

    it("should return new array each time", () => {
      const command: PreCommand = {
        id: "test-command",
        label: "Test Command",
        run: async () => ({ success: true }),
      };

      registry.register(command);

      const commands1 = registry.getAll();
      const commands2 = registry.getAll();

      expect(commands1).not.toBe(commands2); // Different array instances
      expect(commands1).toEqual(commands2); // But same contents
    });

    it("should not allow mutation of registry through returned array", () => {
      const command: PreCommand = {
        id: "test-command",
        label: "Test Command",
        run: async () => ({ success: true }),
      };

      registry.register(command);

      const commands = registry.getAll();
      commands.push({
        id: "malicious-command",
        label: "Malicious",
        run: async () => ({ success: true }),
      });

      const retrieved = registry.get("malicious-command");
      expect(retrieved).toBeUndefined();
    });
  });

  describe("execute", () => {
    it("should execute a registered command", async () => {
      const mockRun = vi.fn(async () => ({ success: true }));

      const preCommand: PreCommand = {
        id: "test-command",
        label: "Test Command",
        run: mockRun,
      };

      registry.register(preCommand);

      const terminalConfig: TerminalConfig = {
        command: 'echo "test"',
      };

      const result = await registry.execute("test-command", terminalConfig);

      expect(mockRun).toHaveBeenCalledWith(terminalConfig);
      expect(result).toEqual({ success: true });
    });

    it("should pass terminal config to command", async () => {
      const mockRun = vi.fn(async (config: TerminalConfig) => ({
        success: true,
      }));

      const preCommand: PreCommand = {
        id: "test-command",
        label: "Test Command",
        run: mockRun,
      };

      registry.register(preCommand);

      const terminalConfig: TerminalConfig = {
        command: "npm test",
        cwd: "/home/user/project",
        preCommandId: "test-command",
      };

      await registry.execute("test-command", terminalConfig);

      expect(mockRun).toHaveBeenCalledWith(terminalConfig);
    });

    it("should return error for non-existent command", async () => {
      const terminalConfig: TerminalConfig = {
        command: 'echo "test"',
      };

      const result = await registry.execute("non-existent", terminalConfig);

      expect(result).toEqual({
        success: false,
        error: "Pre-command not found: non-existent",
      });
    });

    it("should return command result on success", async () => {
      const expectedResult: PreCommandResult = {
        success: true,
        paneOptions: {
          terminalOptions: { cwd: "/custom/path" },
        },
      };

      const preCommand: PreCommand = {
        id: "test-command",
        label: "Test Command",
        run: async () => expectedResult,
      };

      registry.register(preCommand);

      const result = await registry.execute("test-command", {
        command: 'echo "test"',
      });

      expect(result).toEqual(expectedResult);
    });

    it("should return command result on failure", async () => {
      const expectedResult: PreCommandResult = {
        success: false,
        error: "Command failed: insufficient permissions",
      };

      const preCommand: PreCommand = {
        id: "test-command",
        label: "Test Command",
        run: async () => expectedResult,
      };

      registry.register(preCommand);

      const result = await registry.execute("test-command", {
        command: 'echo "test"',
      });

      expect(result).toEqual(expectedResult);
    });

    it("should handle command that throws error", async () => {
      const preCommand: PreCommand = {
        id: "failing-command",
        label: "Failing Command",
        run: async () => {
          throw new Error("Something went wrong");
        },
      };

      registry.register(preCommand);

      const result = await registry.execute("failing-command", {
        command: 'echo "test"',
      });

      expect(result).toEqual({
        success: false,
        error: "Something went wrong",
      });
    });

    it("should handle command that throws non-Error", async () => {
      const preCommand: PreCommand = {
        id: "failing-command",
        label: "Failing Command",
        run: async () => {
          throw "String error";
        },
      };

      registry.register(preCommand);

      const result = await registry.execute("failing-command", {
        command: 'echo "test"',
      });

      expect(result).toEqual({
        success: false,
        error: "Unknown error",
      });
    });

    it("should execute different commands independently", async () => {
      const mockRun1 = vi.fn(async () => ({ success: true }));
      const mockRun2 = vi.fn(async () => ({ success: false, error: "Failed" }));

      registry.register({
        id: "command-1",
        label: "Command 1",
        run: mockRun1,
      });

      registry.register({
        id: "command-2",
        label: "Command 2",
        run: mockRun2,
      });

      const result1 = await registry.execute("command-1", { command: "test" });
      const result2 = await registry.execute("command-2", { command: "test" });

      expect(mockRun1).toHaveBeenCalledTimes(1);
      expect(mockRun2).toHaveBeenCalledTimes(1);
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(false);
    });
  });

  describe("clear", () => {
    it("should clear all registered commands", () => {
      registry.register({
        id: "command-1",
        label: "Command 1",
        run: async () => ({ success: true }),
      });

      registry.register({
        id: "command-2",
        label: "Command 2",
        run: async () => ({ success: true }),
      });

      expect(registry.getAll()).toHaveLength(2);

      registry.clear();

      expect(registry.getAll()).toHaveLength(0);
    });

    it("should allow registering new commands after clear", () => {
      registry.register({
        id: "command-1",
        label: "Command 1",
        run: async () => ({ success: true }),
      });

      registry.clear();

      registry.register({
        id: "command-2",
        label: "Command 2",
        run: async () => ({ success: true }),
      });

      const commands = registry.getAll();
      expect(commands).toHaveLength(1);
      expect(commands[0].id).toBe("command-2");
    });

    it("should work correctly when called multiple times", () => {
      registry.register({
        id: "test-command",
        label: "Test",
        run: async () => ({ success: true }),
      });

      registry.clear();
      registry.clear();
      registry.clear();

      expect(registry.getAll()).toHaveLength(0);
    });

    it("should not affect other registry instances", () => {
      // This test verifies singleton behavior
      const instance1 = PreCommandRegistry.getInstance();
      const instance2 = PreCommandRegistry.getInstance();

      instance1.register({
        id: "test-command",
        label: "Test",
        run: async () => ({ success: true }),
      });

      instance2.clear();

      // Both should be cleared (same instance)
      expect(instance1.getAll()).toHaveLength(0);
      expect(instance2.getAll()).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("should handle empty string ID", () => {
      const preCommand: PreCommand = {
        id: "",
        label: "Empty ID",
        run: async () => ({ success: true }),
      };

      registry.register(preCommand);

      const retrieved = registry.get("");
      expect(retrieved).toBe(preCommand);
    });

    it("should handle very long ID", () => {
      const longId = "a".repeat(1000);

      const preCommand: PreCommand = {
        id: longId,
        label: "Long ID",
        run: async () => ({ success: true }),
      };

      registry.register(preCommand);

      const retrieved = registry.get(longId);
      expect(retrieved).toBe(preCommand);
    });

    it("should handle special characters in ID", () => {
      const specialId = "test-command_123.foo@bar";

      const preCommand: PreCommand = {
        id: specialId,
        label: "Special ID",
        run: async () => ({ success: true }),
      };

      registry.register(preCommand);

      const retrieved = registry.get(specialId);
      expect(retrieved).toBe(preCommand);
    });

    it("should handle async command that takes time", async () => {
      const preCommand: PreCommand = {
        id: "slow-command",
        label: "Slow Command",
        run: async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return { success: true };
        },
      };

      registry.register(preCommand);

      const startTime = Date.now();
      const result = await registry.execute("slow-command", {
        command: "test",
      });
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeGreaterThanOrEqual(100);
    });
  });
});
