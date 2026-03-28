import { describe, it, expect, beforeEach, vi } from "vitest";
import { CommandRegistry } from "@/commands/core/CommandRegistryImpl";
import { ContextKeyService } from "@/commands/contextKeys/ContextKeyServiceImpl";
import { ContextKey } from "@/commands/contextKeys/ContextKey";
import { KeybindingRegistry } from "@/commands/keybindings/KeybindingRegistry";
import { MenuRegistry } from "@/commands/menus/MenuRegistry";
import { MenuId } from "@/commands/menus/types";
import { When } from "@/commands/whenClauses/When";
import type { CommandDescriptor } from "@/commands/core/types";

describe("CommandRegistry", () => {
  let registry: CommandRegistry;
  let contextKeyService: ContextKeyService;

  beforeEach(() => {
    contextKeyService = new ContextKeyService();
    registry = new CommandRegistry(contextKeyService);
  });

  describe("registerCommand()", () => {
    it("should register a command", () => {
      const command: CommandDescriptor = {
        id: "test.command",
        title: "Test Command",
        run: () => {},
      };

      const disposable = registry.registerCommand(command);

      expect(registry.hasCommand("test.command")).toBe(true);
      expect(disposable).toHaveProperty("dispose");
    });

    it("should retrieve registered command", () => {
      const command: CommandDescriptor = {
        id: "test.command",
        title: "Test Command",
        run: () => {},
      };

      registry.registerCommand(command);
      const retrieved = registry.getCommand("test.command");

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe("test.command");
      expect(retrieved?.title).toBe("Test Command");
    });

    it("should warn when registering duplicate command ID", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const command1: CommandDescriptor = {
        id: "test.command",
        title: "First",
        run: () => {},
      };

      const command2: CommandDescriptor = {
        id: "test.command",
        title: "Second",
        run: () => {},
      };

      registry.registerCommand(command1);
      registry.registerCommand(command2);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("test.command is already registered"),
      );

      // Second command should overwrite first
      const retrieved = registry.getCommand("test.command");
      expect(retrieved?.title).toBe("Second");

      warnSpy.mockRestore();
    });

    it("should return all registered commands", () => {
      const command1: CommandDescriptor = {
        id: "test.command1",
        title: "Command 1",
        run: () => {},
      };

      const command2: CommandDescriptor = {
        id: "test.command2",
        title: "Command 2",
        run: () => {},
      };

      registry.registerCommand(command1);
      registry.registerCommand(command2);

      const allCommands = registry.getAllCommands();

      expect(allCommands).toHaveLength(2);
      expect(allCommands.map((c) => c.id)).toContain("test.command1");
      expect(allCommands.map((c) => c.id)).toContain("test.command2");
    });
  });

  describe("executeCommand()", () => {
    it("should execute a registered command", async () => {
      const runFn = vi.fn();
      const command: CommandDescriptor = {
        id: "test.command",
        title: "Test Command",
        run: runFn,
      };

      registry.registerCommand(command);
      await registry.executeCommand("test.command");

      expect(runFn).toHaveBeenCalledTimes(1);
    });

    it("should pass arguments to command handler", async () => {
      const runFn = vi.fn();
      const command: CommandDescriptor = {
        id: "test.command",
        title: "Test Command",
        run: runFn,
      };

      registry.registerCommand(command);
      await registry.executeCommand("test.command", "arg1", 42, {
        key: "value",
      });

      expect(runFn).toHaveBeenCalledWith(
        expect.anything(), // context
        "arg1",
        42,
        { key: "value" },
      );
    });

    it("should pass context to command handler", async () => {
      const runFn = vi.fn();
      const command: CommandDescriptor = {
        id: "test.command",
        title: "Test Command",
        run: runFn,
      };

      registry.registerCommand(command);
      await registry.executeCommand("test.command");

      expect(runFn).toHaveBeenCalledWith(
        expect.objectContaining({
          contextKeys: contextKeyService,
        }),
      );
    });

    it("should return undefined for non-existent command", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await registry.executeCommand("non.existent");

      expect(result).toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Command non.existent not found"),
      );

      errorSpy.mockRestore();
    });

    it("should return command result", async () => {
      const command: CommandDescriptor = {
        id: "test.command",
        title: "Test Command",
        run: async () => "result-value",
      };

      registry.registerCommand(command);
      const result = await registry.executeCommand<string>("test.command");

      expect(result).toBe("result-value");
    });

    it("should handle async command handlers", async () => {
      const command: CommandDescriptor = {
        id: "test.command",
        title: "Test Command",
        run: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return "async-result";
        },
      };

      registry.registerCommand(command);
      const result = await registry.executeCommand<string>("test.command");

      expect(result).toBe("async-result");
    });

    it("should throw error if command handler throws", async () => {
      const command: CommandDescriptor = {
        id: "test.command",
        title: "Test Command",
        run: () => {
          throw new Error("Command failed");
        },
      };

      registry.registerCommand(command);

      await expect(registry.executeCommand("test.command")).rejects.toThrow(
        "Command failed",
      );
    });
  });

  describe("when clause evaluation", () => {
    it("should execute command when when clause is true", async () => {
      const runFn = vi.fn();
      const key = new ContextKey("enabled", false);

      const command: CommandDescriptor = {
        id: "test.command",
        title: "Test Command",
        when: key.isTrue(),
        run: runFn,
      };

      registry.registerCommand(command);

      // Set context to make when clause true
      contextKeyService.setGlobal("enabled", true);

      await registry.executeCommand("test.command");

      expect(runFn).toHaveBeenCalled();
    });

    it("should not execute command when when clause is false", async () => {
      const runFn = vi.fn();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const key = new ContextKey("enabled", false);

      const command: CommandDescriptor = {
        id: "test.command",
        title: "Test Command",
        when: key.isTrue(),
        run: runFn,
      };

      registry.registerCommand(command);

      // Set context to make when clause false
      contextKeyService.setGlobal("enabled", false);

      const result = await registry.executeCommand("test.command");

      expect(runFn).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("test.command is disabled by when clause"),
      );

      warnSpy.mockRestore();
    });

    it("should execute command with no when clause", async () => {
      const runFn = vi.fn();

      const command: CommandDescriptor = {
        id: "test.command",
        title: "Test Command",
        run: runFn,
      };

      registry.registerCommand(command);

      await registry.executeCommand("test.command");

      expect(runFn).toHaveBeenCalled();
    });

    it("should evaluate complex when clauses", async () => {
      const runFn = vi.fn();
      const enabled = new ContextKey("enabled", false);
      const count = new ContextKey("count", 0);

      const command: CommandDescriptor = {
        id: "test.command",
        title: "Test Command",
        when: When.and(enabled.isTrue(), count.greaterThan(0)),
        run: runFn,
      };

      registry.registerCommand(command);

      // Both conditions false
      contextKeyService.setGlobal("enabled", false);
      contextKeyService.setGlobal("count", 0);
      await registry.executeCommand("test.command");
      expect(runFn).not.toHaveBeenCalled();

      // One condition true
      contextKeyService.setGlobal("enabled", true);
      contextKeyService.setGlobal("count", 0);
      await registry.executeCommand("test.command");
      expect(runFn).not.toHaveBeenCalled();

      // Both conditions true
      contextKeyService.setGlobal("enabled", true);
      contextKeyService.setGlobal("count", 5);
      await registry.executeCommand("test.command");
      expect(runFn).toHaveBeenCalled();
    });
  });

  describe("disposal", () => {
    it("should remove command on disposal", () => {
      const command: CommandDescriptor = {
        id: "test.command",
        title: "Test Command",
        run: () => {},
      };

      const disposable = registry.registerCommand(command);

      expect(registry.hasCommand("test.command")).toBe(true);

      disposable.dispose();

      expect(registry.hasCommand("test.command")).toBe(false);
    });

    it("should not execute disposed command", async () => {
      const runFn = vi.fn();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const command: CommandDescriptor = {
        id: "test.command",
        title: "Test Command",
        run: runFn,
      };

      const disposable = registry.registerCommand(command);
      disposable.dispose();

      await registry.executeCommand("test.command");

      expect(runFn).not.toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  describe("hasCommand()", () => {
    it("should return true for registered command", () => {
      const command: CommandDescriptor = {
        id: "test.command",
        title: "Test Command",
        run: () => {},
      };

      registry.registerCommand(command);

      expect(registry.hasCommand("test.command")).toBe(true);
    });

    it("should return false for non-existent command", () => {
      expect(registry.hasCommand("non.existent")).toBe(false);
    });
  });

  describe("getCommand()", () => {
    it("should return command descriptor", () => {
      const command: CommandDescriptor = {
        id: "test.command",
        title: "Test Command",
        category: "Test",
        run: () => {},
      };

      registry.registerCommand(command);
      const retrieved = registry.getCommand("test.command");

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe("test.command");
      expect(retrieved?.title).toBe("Test Command");
      expect(retrieved?.category).toBe("Test");
    });

    it("should return undefined for non-existent command", () => {
      const retrieved = registry.getCommand("non.existent");

      expect(retrieved).toBeUndefined();
    });
  });

  describe("integration tests", () => {
    it("should register multiple commands and execute them", async () => {
      const run1 = vi.fn();
      const run2 = vi.fn();
      const run3 = vi.fn();

      registry.registerCommand({
        id: "cmd1",
        title: "Command 1",
        run: run1,
      });

      registry.registerCommand({
        id: "cmd2",
        title: "Command 2",
        run: run2,
      });

      registry.registerCommand({
        id: "cmd3",
        title: "Command 3",
        run: run3,
      });

      await registry.executeCommand("cmd1");
      await registry.executeCommand("cmd2");
      await registry.executeCommand("cmd3");

      expect(run1).toHaveBeenCalledTimes(1);
      expect(run2).toHaveBeenCalledTimes(1);
      expect(run3).toHaveBeenCalledTimes(1);
    });

    it("should handle command with typed context", async () => {
      interface CustomContext {
        readonly customProperty: string;
      }

      const runFn = vi.fn();

      const command: CommandDescriptor<any> = {
        id: "test.command",
        title: "Test Command",
        run: (ctx: CustomContext) => {
          runFn(ctx.customProperty);
        },
      };

      registry.registerCommand(command);
      await registry.executeCommand("test.command");

      expect(runFn).toHaveBeenCalled();
    });
  });

  describe("dispose()", () => {
    it("should remove command from registry", () => {
      const command: CommandDescriptor = {
        id: "test.command",
        title: "Test Command",
        run: () => {},
      };

      const disposable = registry.registerCommand(command);

      expect(registry.hasCommand("test.command")).toBe(true);

      disposable.dispose();

      expect(registry.hasCommand("test.command")).toBe(false);
    });

    it("should cleanup keybindings when disposed", () => {
      const keybindingRegistry = new KeybindingRegistry();
      const registryWithKeybindings = new CommandRegistry(
        contextKeyService,
        keybindingRegistry,
      );

      const command: CommandDescriptor = {
        id: "test.command",
        title: "Test Command",
        keybinding: { key: "Ctrl+T" },
        run: () => {},
      };

      const disposable = registryWithKeybindings.registerCommand(command);

      expect(
        keybindingRegistry.getKeybindingsForCommand("test.command"),
      ).toHaveLength(1);

      disposable.dispose();

      expect(
        keybindingRegistry.getKeybindingsForCommand("test.command"),
      ).toHaveLength(0);
    });

    it("should cleanup menus when disposed", () => {
      const menuRegistry = new MenuRegistry();
      const keybindingRegistry = new KeybindingRegistry();
      const registryWithMenus = new CommandRegistry(
        contextKeyService,
        keybindingRegistry,
        menuRegistry,
      );

      const command: CommandDescriptor = {
        id: "test.command",
        title: "Test Command",
        menu: { id: MenuId.CommandPalette },
        run: () => {},
      };

      const disposable = registryWithMenus.registerCommand(command);

      expect(menuRegistry.getMenuItems(MenuId.CommandPalette)).toHaveLength(1);

      disposable.dispose();

      expect(menuRegistry.getMenuItems(MenuId.CommandPalette)).toHaveLength(0);
    });
  });
});
