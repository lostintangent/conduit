import {
  handleCreateVM,
  handleOpenInVSCode,
} from "@/commands/handlers/terminalHandlers";
import * as notifications from "@/store/actions/notifications";
import * as tabActions from "@/store/actions/tab";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock window.conduit
const mockApi = {
  createTerminal: vi.fn(),
  runBackgroundCommand: vi.fn(),
};

global.window = {
  conduit: mockApi,
} as any;

// Mock store actions
vi.mock("@/store/actions/notifications", () => ({
  enqueueNotification: vi.fn(),
  updateNotification: vi.fn(),
}));

vi.mock("@/store/actions/tab", () => ({
  openTabFromExistingSession: vi.fn(),
}));

describe("terminalHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("handleCreateVM", () => {
    it("should create VM and show success notification", async () => {
      const mockResult = {
        sessionId: "session-123",
        cwd: "/home/user",
        title: "VM Terminal",
        sandboxId: "vm-123",
      };

      mockApi.createTerminal.mockResolvedValue(mockResult);
      vi.mocked(notifications.enqueueNotification).mockReturnValue("notif-1");

      await handleCreateVM();

      // Should show "Preparing cloud workspace..." notification
      expect(notifications.enqueueNotification).toHaveBeenCalledWith({
        kind: "info",
        message: "Preparing cloud workspace...",
        persistent: true,
      });

      // Should create terminal with VM flag
      expect(mockApi.createTerminal).toHaveBeenCalledWith({
        isRemoteVM: true,
      });

      // Should update notification to success
      expect(notifications.updateNotification).toHaveBeenCalledWith("notif-1", {
        kind: "success",
        message: "Cloud workspace ready",
        autoCloseMs: 2500,
      });

      // Should open tab with the session
      expect(tabActions.openTabFromExistingSession).toHaveBeenCalledWith({
        sessionId: "session-123",
        cwd: "/home/user",
        title: "VM Terminal",
        sandboxId: "vm-123",
      });
    });

    it("should handle VM creation failure", async () => {
      mockApi.createTerminal.mockResolvedValue(null);
      vi.mocked(notifications.enqueueNotification).mockReturnValue("notif-2");

      await handleCreateVM();

      // Should show error notification
      expect(notifications.updateNotification).toHaveBeenCalledWith("notif-2", {
        kind: "error",
        message: "Failed to create VM terminal",
        details: "Failed to create VM terminal",
        autoCloseMs: null,
      });

      // Should not open tab
      expect(tabActions.openTabFromExistingSession).not.toHaveBeenCalled();
    });

    it("should handle VM creation error exception", async () => {
      const error = new Error("Network error");
      mockApi.createTerminal.mockRejectedValue(error);
      vi.mocked(notifications.enqueueNotification).mockReturnValue("notif-3");

      await handleCreateVM();

      // Should show error notification with error message
      expect(notifications.updateNotification).toHaveBeenCalledWith("notif-3", {
        kind: "error",
        message: "Failed to create VM terminal",
        details: "Network error",
        autoCloseMs: null,
      });

      // Should not open tab
      expect(tabActions.openTabFromExistingSession).not.toHaveBeenCalled();
    });

    it("should handle non-Error exceptions", async () => {
      mockApi.createTerminal.mockRejectedValue("String error");
      vi.mocked(notifications.enqueueNotification).mockReturnValue("notif-4");

      await handleCreateVM();

      // Should show error notification with stringified error
      expect(notifications.updateNotification).toHaveBeenCalledWith("notif-4", {
        kind: "error",
        message: "Failed to create VM terminal",
        details: "String error",
        autoCloseMs: null,
      });
    });

    it("should handle sandboxId being null/undefined", async () => {
      const mockResult = {
        sessionId: "session-456",
        cwd: "/home/user",
        title: "VM Terminal",
        vmId: undefined as string | undefined,
      };

      mockApi.createTerminal.mockResolvedValue(mockResult);
      vi.mocked(notifications.enqueueNotification).mockReturnValue("notif-5");

      await handleCreateVM();

      // Should open tab with undefined sandboxId
      expect(tabActions.openTabFromExistingSession).toHaveBeenCalledWith({
        sessionId: "session-456",
        cwd: "/home/user",
        title: "VM Terminal",
        sandboxId: undefined,
      });
    });
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

      expect(mockApi.runBackgroundCommand).toHaveBeenCalledWith({
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

        expect(mockApi.runBackgroundCommand).toHaveBeenCalledWith({
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

      expect(mockApi.runBackgroundCommand).not.toHaveBeenCalled();
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

      expect(mockApi.runBackgroundCommand).not.toHaveBeenCalled();
    });

    it("should not call runBackgroundCommand when activeTab is null", async () => {
      await handleOpenInVSCode(null);

      expect(mockApi.runBackgroundCommand).not.toHaveBeenCalled();
    });

    it("should not call runBackgroundCommand when activePane is missing", async () => {
      const mockActiveTab = {
        id: "tab-123",
        activePaneId: "pane-456",
        panes: {},
      };

      await handleOpenInVSCode(mockActiveTab);

      expect(mockApi.runBackgroundCommand).not.toHaveBeenCalled();
    });

    it("should propagate errors from runBackgroundCommand", async () => {
      const error = new Error("VS Code not found");
      mockApi.runBackgroundCommand.mockRejectedValue(error);

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
