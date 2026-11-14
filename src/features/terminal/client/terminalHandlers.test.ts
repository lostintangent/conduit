import { handleOpenInVSCode } from "@features/terminal/client/terminalHandlers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock window.conduit
const mockApi = {
  terminal: { runBackgroundCommand: vi.fn() },
};

global.window = {
  conduit: mockApi,
} as any;

describe("terminalHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("handleOpenInVSCode", () => {
    it("should open directory in VS Code when active pane is terminal", async () => {
      const mockActiveTab = {
        id: "tab-123",
        activePaneId: "pane-456",
        panes: {
          "pane-456": {
            type: "terminal",
            cwd: "/home/user/project",
          },
        },
      };

      await handleOpenInVSCode(mockActiveTab);

      expect(mockApi.terminal.runBackgroundCommand).toHaveBeenCalledWith({
        command: "code-insiders",
        args: ["/home/user/project"],
        cwd: "/home/user/project",
      });
    });

    it("should handle different directory paths", async () => {
      const paths = [
        "/usr/local/bin",
        "/home/user/documents/my project",
        "C:\\Users\\name\\project",
      ];

      for (const path of paths) {
        vi.clearAllMocks();
        const mockActiveTab = {
          id: "tab-123",
          activePaneId: "pane-456",
          panes: {
            "pane-456": {
              type: "terminal",
              cwd: path,
            },
          },
        };

        await handleOpenInVSCode(mockActiveTab);

        expect(mockApi.terminal.runBackgroundCommand).toHaveBeenCalledWith({
          command: "code-insiders",
          args: [path],
          cwd: path,
        });
      }
    });

    it("should not call runBackgroundCommand when active pane is not terminal", async () => {
      const mockActiveTab = {
        id: "tab-123",
        activePaneId: "pane-456",
        panes: {
          "pane-456": {
            type: "browser",
            url: "https://example.com",
          },
        },
      };

      await handleOpenInVSCode(mockActiveTab);

      expect(mockApi.terminal.runBackgroundCommand).not.toHaveBeenCalled();
    });

    it("should not call runBackgroundCommand when cwd is missing", async () => {
      const mockActiveTab = {
        id: "tab-123",
        activePaneId: "pane-456",
        panes: {
          "pane-456": {
            type: "terminal",
            // No cwd
          },
        },
      };

      await handleOpenInVSCode(mockActiveTab);

      expect(mockApi.terminal.runBackgroundCommand).not.toHaveBeenCalled();
    });

    it("should not call runBackgroundCommand when activeTab is null", async () => {
      await handleOpenInVSCode(null);

      expect(mockApi.terminal.runBackgroundCommand).not.toHaveBeenCalled();
    });

    it("should not call runBackgroundCommand when activePane is missing", async () => {
      const mockActiveTab = {
        id: "tab-123",
        activePaneId: "pane-456",
        panes: {},
      };

      await handleOpenInVSCode(mockActiveTab);

      expect(mockApi.terminal.runBackgroundCommand).not.toHaveBeenCalled();
    });

    it("should propagate errors from runBackgroundCommand", async () => {
      const error = new Error("VS Code not found");
      mockApi.terminal.runBackgroundCommand.mockRejectedValue(error);

      const mockActiveTab = {
        id: "tab-123",
        activePaneId: "pane-456",
        panes: {
          "pane-456": {
            type: "terminal",
            cwd: "/test/path",
          },
        },
      };

      await expect(handleOpenInVSCode(mockActiveTab)).rejects.toThrow(
        "VS Code not found",
      );
    });
  });
});
