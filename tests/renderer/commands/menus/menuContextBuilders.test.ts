import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  registerMenuContextBuilder,
  getMenuContextBuilder,
  hasMenuContextBuilder,
  type MenuContextBuilder,
  type MenuContextParams,
} from "@/commands/menus/menuContextBuilders";
import { MenuId } from "@/commands/menus/types";
import type { IContextKeyService } from "@/commands/contextKeys/ContextKeyService";

describe("menuContextBuilders", () => {
  let mockContextKeyService: IContextKeyService;
  let mockCheckGitRepo: (cwd: string | null | undefined) => Promise<boolean>;

  beforeEach(() => {
    // Reset the registry between tests
    // Note: In a real implementation, you might want to export a reset function
    // For now, we'll just overwrite registrations

    mockContextKeyService = {
      setGlobal: vi.fn(),
      setTabProperty: vi.fn(),
      setPaneProperty: vi.fn(),
      get: vi.fn(),
      getAll: vi.fn(() => ({})),
      onDidChangeContext: vi.fn(() => () => {}),
    };

    mockCheckGitRepo = vi.fn();
  });

  describe("registerMenuContextBuilder", () => {
    it("should register a context builder for a menu ID", () => {
      const builder: MenuContextBuilder = vi.fn();

      registerMenuContextBuilder(MenuId.TabContext, builder);

      expect(hasMenuContextBuilder(MenuId.TabContext)).toBe(true);
      expect(getMenuContextBuilder(MenuId.TabContext)).toBe(builder);
    });

    it("should allow registering multiple builders for different menus", () => {
      const tabBuilder: MenuContextBuilder = vi.fn();
      const paneBuilder: MenuContextBuilder = vi.fn();

      registerMenuContextBuilder(MenuId.TabContext, tabBuilder);
      registerMenuContextBuilder(MenuId.PaneContext, paneBuilder);

      expect(getMenuContextBuilder(MenuId.TabContext)).toBe(tabBuilder);
      expect(getMenuContextBuilder(MenuId.PaneContext)).toBe(paneBuilder);
    });

    it("should overwrite existing builder for the same menu ID", () => {
      const oldBuilder: MenuContextBuilder = vi.fn();
      const newBuilder: MenuContextBuilder = vi.fn();

      registerMenuContextBuilder(MenuId.TabContext, oldBuilder);
      registerMenuContextBuilder(MenuId.TabContext, newBuilder);

      expect(getMenuContextBuilder(MenuId.TabContext)).toBe(newBuilder);
      expect(getMenuContextBuilder(MenuId.TabContext)).not.toBe(oldBuilder);
    });
  });

  describe("getMenuContextBuilder", () => {
    it("should return undefined for unregistered menu ID", () => {
      expect(getMenuContextBuilder(MenuId.EditorContext)).toBeUndefined();
    });

    it("should return the registered builder", () => {
      const builder: MenuContextBuilder = vi.fn();
      registerMenuContextBuilder(MenuId.TabContext, builder);

      expect(getMenuContextBuilder(MenuId.TabContext)).toBe(builder);
    });
  });

  describe("hasMenuContextBuilder", () => {
    it("should return false for unregistered menu ID", () => {
      expect(hasMenuContextBuilder(MenuId.EditorContext)).toBe(false);
    });

    it("should return true for registered menu ID", () => {
      const builder: MenuContextBuilder = vi.fn();
      registerMenuContextBuilder(MenuId.TabContext, builder);

      expect(hasMenuContextBuilder(MenuId.TabContext)).toBe(true);
    });
  });

  describe("MenuContextBuilder signature", () => {
    it("should receive context service, params, and checkGitRepo", async () => {
      const builder: MenuContextBuilder = vi.fn();
      const params: MenuContextParams = {
        tabId: "tab-1",
        paneId: "pane-1",
        tab: { id: "tab-1", panes: {} },
        pane: { type: "terminal", cwd: "/repo" },
        canChangeTitle: true,
      };

      registerMenuContextBuilder(MenuId.PaneContext, builder);

      const registeredBuilder = getMenuContextBuilder(MenuId.PaneContext);
      await registeredBuilder?.(
        mockContextKeyService,
        params,
        mockCheckGitRepo,
      );

      expect(builder).toHaveBeenCalledWith(
        mockContextKeyService,
        params,
        mockCheckGitRepo,
      );
    });

    it("should allow builders to update context keys", async () => {
      const builder: MenuContextBuilder = async (contextKeyService) => {
        contextKeyService.setGlobal("hasGitRepo", true);
        contextKeyService.setGlobal("customKey", "value");
      };

      const params: MenuContextParams = {
        tabId: "tab-1",
        tab: { id: "tab-1" },
        canChangeTitle: true,
      };

      registerMenuContextBuilder(MenuId.TabContext, builder);

      const registeredBuilder = getMenuContextBuilder(MenuId.TabContext);
      await registeredBuilder?.(
        mockContextKeyService,
        params,
        mockCheckGitRepo,
      );

      expect(mockContextKeyService.setGlobal).toHaveBeenCalledWith(
        "hasGitRepo",
        true,
      );
      expect(mockContextKeyService.setGlobal).toHaveBeenCalledWith(
        "customKey",
        "value",
      );
    });

    it("should allow async builders to check git repo", async () => {
      mockCheckGitRepo = vi.fn().mockResolvedValue(true);

      const builder: MenuContextBuilder = async (
        contextKeyService,
        params,
        checkGitRepo,
      ) => {
        const hasRepo = await checkGitRepo(params.pane?.cwd);
        contextKeyService.setGlobal("hasGitRepo", hasRepo);
      };

      const params: MenuContextParams = {
        tabId: "tab-1",
        paneId: "pane-1",
        tab: { id: "tab-1" },
        pane: { type: "terminal", cwd: "/my-repo" },
        canChangeTitle: true,
      };

      registerMenuContextBuilder(MenuId.PaneContext, builder);

      const registeredBuilder = getMenuContextBuilder(MenuId.PaneContext);
      await registeredBuilder?.(
        mockContextKeyService,
        params,
        mockCheckGitRepo,
      );

      expect(mockCheckGitRepo).toHaveBeenCalledWith("/my-repo");
      expect(mockContextKeyService.setGlobal).toHaveBeenCalledWith(
        "hasGitRepo",
        true,
      );
    });
  });

  describe("Real-world scenarios", () => {
    it("should support tab context builder pattern", async () => {
      const tabContextBuilder: MenuContextBuilder = async (
        contextKeyService,
        params,
        checkGitRepo,
      ) => {
        const { tab } = params;
        const activePane = tab.panes[tab.activePaneId];

        let hasGitRepoValue = false;
        if (activePane && activePane.type === "terminal") {
          hasGitRepoValue = await checkGitRepo(activePane.cwd);
        }

        contextKeyService.setGlobal("hasGitRepo", hasGitRepoValue);
      };

      mockCheckGitRepo = vi.fn().mockResolvedValue(true);

      const params: MenuContextParams = {
        tabId: "tab-1",
        tab: {
          id: "tab-1",
          activePaneId: "pane-1",
          panes: {
            "pane-1": { type: "terminal", cwd: "/repo" },
          },
        },
        canChangeTitle: true,
      };

      await tabContextBuilder(mockContextKeyService, params, mockCheckGitRepo);

      expect(mockCheckGitRepo).toHaveBeenCalledWith("/repo");
      expect(mockContextKeyService.setGlobal).toHaveBeenCalledWith(
        "hasGitRepo",
        true,
      );
    });

    it("should support pane context builder pattern", async () => {
      const paneContextBuilder: MenuContextBuilder = async (
        contextKeyService,
        params,
        checkGitRepo,
      ) => {
        const { pane } = params;

        let hasGitRepoValue = false;
        if (pane && pane.type === "terminal") {
          hasGitRepoValue = await checkGitRepo(pane.cwd);
        }

        contextKeyService.setGlobal("hasGitRepo", hasGitRepoValue);
      };

      mockCheckGitRepo = vi.fn().mockResolvedValue(false);

      const params: MenuContextParams = {
        tabId: "tab-1",
        paneId: "pane-1",
        tab: { id: "tab-1" },
        pane: { type: "terminal", cwd: "/no-repo" },
        canChangeTitle: true,
      };

      await paneContextBuilder(mockContextKeyService, params, mockCheckGitRepo);

      expect(mockCheckGitRepo).toHaveBeenCalledWith("/no-repo");
      expect(mockContextKeyService.setGlobal).toHaveBeenCalledWith(
        "hasGitRepo",
        false,
      );
    });

    it("should handle non-terminal panes gracefully", async () => {
      const paneContextBuilder: MenuContextBuilder = async (
        contextKeyService,
        params,
        checkGitRepo,
      ) => {
        const { pane } = params;

        let hasGitRepoValue = false;
        if (pane && pane.type === "terminal") {
          hasGitRepoValue = await checkGitRepo(pane.cwd);
        }

        contextKeyService.setGlobal("hasGitRepo", hasGitRepoValue);
      };

      const params: MenuContextParams = {
        tabId: "tab-1",
        paneId: "pane-1",
        tab: { id: "tab-1" },
        pane: { type: "browser", url: "https://example.com" },
        canChangeTitle: true,
      };

      await paneContextBuilder(mockContextKeyService, params, mockCheckGitRepo);

      expect(mockCheckGitRepo).not.toHaveBeenCalled();
      expect(mockContextKeyService.setGlobal).toHaveBeenCalledWith(
        "hasGitRepo",
        false,
      );
    });
  });
});
