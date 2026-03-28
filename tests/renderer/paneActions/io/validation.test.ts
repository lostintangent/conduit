/**
 * Unit tests for pane actions validation
 */

import {
  validatePaneActionsConfig,
  ValidationError,
} from "@/commands/paneActions/io/validation";
import { PreCommandRegistry } from "@/commands/preCommands/registry";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("validation", () => {
  // Clean up registry before each test
  beforeEach(() => {
    PreCommandRegistry.getInstance().clear();
  });

  afterEach(() => {
    PreCommandRegistry.getInstance().clear();
  });

  describe("validatePaneActionsConfig", () => {
    describe("root validation", () => {
      it("should reject non-array input", () => {
        expect(() => validatePaneActionsConfig({})).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig({})).toThrow(
          "Configuration must be an array of actions",
        );
      });

      it("should reject empty array", () => {
        expect(() => validatePaneActionsConfig([])).toThrow(ValidationError);
        expect(() => validatePaneActionsConfig([])).toThrow(
          "must contain at least 1 action",
        );
      });

      it("should reject array with more than 5 actions", () => {
        const actions = Array(6).fill({
          name: "Test",
          icon: "test",
          enabled: true,
          paneType: "terminal",
          config: { command: "test" },
        });

        expect(() => validatePaneActionsConfig(actions)).toThrow(
          ValidationError,
        );
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          "at most 5 actions",
        );
      });

      it("should accept array with 1 action", () => {
        const actions = [
          {
            name: "Test",
            icon: "test",
            enabled: true,
            paneType: "terminal",
            config: { command: "test" },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).not.toThrow();
      });

      it("should accept array with 5 actions", () => {
        const actions = Array(5).fill({
          name: "Test",
          icon: "test",
          enabled: true,
          paneType: "terminal",
          config: { command: "test" },
        });

        expect(() => validatePaneActionsConfig(actions)).not.toThrow();
      });
    });

    describe("action validation", () => {
      it("should reject non-object action", () => {
        expect(() => validatePaneActionsConfig(["not an object"])).toThrow(
          ValidationError,
        );
        expect(() => validatePaneActionsConfig(["not an object"])).toThrow(
          "Action must be an object",
        );
      });

      it("should reject missing name", () => {
        const actions = [
          {
            icon: "test",
            enabled: true,
            paneType: "terminal",
            config: { command: "test" },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(
          ValidationError,
        );
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          "name must be a string",
        );
      });

      it("should reject empty name", () => {
        const actions = [
          {
            name: "   ",
            icon: "test",
            enabled: true,
            paneType: "terminal",
            config: { command: "test" },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(
          ValidationError,
        );
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          "name cannot be empty",
        );
      });

      it("should reject missing icon", () => {
        const actions = [
          {
            name: "Test",
            enabled: true,
            paneType: "terminal",
            config: { command: "test" },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(
          ValidationError,
        );
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          "icon must be a string",
        );
      });

      it("should reject empty icon", () => {
        const actions = [
          {
            name: "Test",
            icon: "",
            enabled: true,
            paneType: "terminal",
            config: { command: "test" },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(
          ValidationError,
        );
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          "icon cannot be empty",
        );
      });

      it("should reject missing enabled", () => {
        const actions = [
          {
            name: "Test",
            icon: "test",
            paneType: "terminal",
            config: { command: "test" },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(
          ValidationError,
        );
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          "enabled must be a boolean",
        );
      });

      it("should reject invalid paneType", () => {
        const actions = [
          {
            name: "Test",
            icon: "test",
            enabled: true,
            paneType: "invalid",
            config: { command: "test" },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(
          ValidationError,
        );
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          "paneType must be one of: terminal, editor, browser",
        );
      });

      it("should reject missing config", () => {
        const actions = [
          {
            name: "Test",
            icon: "test",
            enabled: true,
            paneType: "terminal",
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(
          ValidationError,
        );
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          "config must be an object",
        );
      });
    });

    describe("terminal config validation", () => {
      it("should accept valid terminal config", () => {
        const actions = [
          {
            name: "Test",
            icon: "test",
            enabled: true,
            paneType: "terminal",
            config: { command: "npm test" },
          },
        ];

        const result = validatePaneActionsConfig(actions);
        expect(result).toHaveLength(1);
        expect(result[0].config).toEqual({ command: "npm test" });
      });

      it("should reject missing command", () => {
        const actions = [
          {
            name: "Test",
            icon: "test",
            enabled: true,
            paneType: "terminal",
            config: {},
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(
          ValidationError,
        );
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          "command must be a string",
        );
      });

      it("should accept empty command", () => {
        const actions = [
          {
            name: "Test",
            icon: "test",
            enabled: true,
            paneType: "terminal",
            config: { command: "" },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).not.toThrow();
      });

      it("should accept valid terminal config with cwd", () => {
        const actions = [
          {
            name: "Test",
            icon: "test",
            enabled: true,
            paneType: "terminal",
            config: { command: "npm test", cwd: "/home/user" },
          },
        ];

        const result = validatePaneActionsConfig(actions);
        expect(result[0].config).toEqual({
          command: "npm test",
          cwd: "/home/user",
        });
      });

      it("should accept valid terminal config with preCommandId", () => {
        const actions = [
          {
            name: "Test",
            icon: "test",
            enabled: true,
            paneType: "terminal",
            config: { command: "npm test", preCommandId: "verify-git-repo" },
          },
        ];

        const result = validatePaneActionsConfig(actions);
        expect(result[0].config).toEqual({
          command: "npm test",
          preCommandId: "verify-git-repo",
        });
      });

      it("should accept valid terminal config with all optional fields", () => {
        const actions = [
          {
            name: "Test",
            icon: "test",
            enabled: true,
            paneType: "terminal",
            config: {
              command: "npm test",
              cwd: "/home/user",
              preCommandId: "create-agent-session",
            },
          },
        ];

        const result = validatePaneActionsConfig(actions);
        expect(result[0].config).toEqual({
          command: "npm test",
          cwd: "/home/user",
          preCommandId: "create-agent-session",
        });
      });

      it("should reject non-string preCommandId", () => {
        const actions = [
          {
            name: "Test",
            icon: "test",
            enabled: true,
            paneType: "terminal",
            config: { command: "npm test", preCommandId: 123 },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(
          ValidationError,
        );
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          "preCommandId must be a string",
        );
      });

      it("should reject non-string cwd", () => {
        const actions = [
          {
            name: "Test",
            icon: "test",
            enabled: true,
            paneType: "terminal",
            config: { command: "npm test", cwd: 123 },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(
          ValidationError,
        );
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          "cwd must be a string",
        );
      });

      it("should accept unknown preCommandId without throwing (forward compatibility)", () => {
        const actions = [
          {
            name: "Test",
            icon: "test",
            enabled: true,
            paneType: "terminal",
            config: { command: "npm test", preCommandId: "unknown-command" },
          },
        ];

        // Should not throw - allows forward compatibility
        const result = validatePaneActionsConfig(actions);
        expect(result[0].config).toEqual({
          command: "npm test",
          preCommandId: "unknown-command",
        });
      });
    });

    describe("editor config validation", () => {
      it("should accept empty editor config", () => {
        const actions = [
          {
            name: "Test",
            icon: "test",
            enabled: true,
            paneType: "editor",
            config: {},
          },
        ];

        const result = validatePaneActionsConfig(actions);
        expect(result[0].config).toEqual({});
      });

      it("should accept empty editor config", () => {
        const actions = [
          {
            name: "Test",
            icon: "test",
            enabled: true,
            paneType: "editor",
            config: {},
          },
        ];

        const result = validatePaneActionsConfig(actions);
        expect(result[0].config).toEqual({});
      });
    });

    describe("browser config validation", () => {
      it("should accept valid browser config", () => {
        const actions = [
          {
            name: "Test",
            icon: "test",
            enabled: true,
            paneType: "browser",
            config: { url: "https://example.com" },
          },
        ];

        const result = validatePaneActionsConfig(actions);
        expect(result[0].config).toEqual({ url: "https://example.com" });
      });

      it("should reject missing url", () => {
        const actions = [
          {
            name: "Test",
            icon: "test",
            enabled: true,
            paneType: "browser",
            config: {},
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(
          ValidationError,
        );
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          "url must be a string",
        );
      });

      it("should reject empty url", () => {
        const actions = [
          {
            name: "Test",
            icon: "test",
            enabled: true,
            paneType: "browser",
            config: { url: "   " },
          },
        ];

        expect(() => validatePaneActionsConfig(actions)).toThrow(
          ValidationError,
        );
        expect(() => validatePaneActionsConfig(actions)).toThrow(
          "url cannot be empty",
        );
      });
    });

    describe("complete valid examples", () => {
      it("should validate default actions", () => {
        const actions = [
          {
            name: "Source Control",
            icon: "git-branch",
            enabled: true,
            paneType: "terminal",
            config: { command: "git status" },
          },
          {
            name: "Editor",
            icon: "code",
            enabled: true,
            paneType: "editor",
            config: {},
          },
          {
            name: "Agent",
            icon: "bot",
            enabled: true,
            paneType: "terminal",
            config: { command: "claude-code" },
          },
          {
            name: "Browser",
            icon: "globe",
            enabled: false,
            paneType: "browser",
            config: { url: "https://github.com" },
          },
        ];

        const result = validatePaneActionsConfig(actions);
        expect(result).toHaveLength(4);
      });
    });
  });
});
