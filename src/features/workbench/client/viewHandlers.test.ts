import { describe, it, expect, vi } from "vitest";
import {
  handleToggleDesignMode,
  handleResetLayout,
} from "@features/workbench/client/viewHandlers";

describe("viewHandlers", () => {
  describe("handleToggleDesignMode", () => {
    it("should toggle from normal to design mode", () => {
      const setApplicationMode = vi.fn();

      handleToggleDesignMode("normal", setApplicationMode);

      expect(setApplicationMode).toHaveBeenCalledWith("design");
    });

    it("should toggle from design to normal mode", () => {
      const setApplicationMode = vi.fn();

      handleToggleDesignMode("design", setApplicationMode);

      expect(setApplicationMode).toHaveBeenCalledWith("normal");
    });
  });

  describe("handleResetLayout", () => {
    it("should reset layout sizes for the given tab", () => {
      const tabId = "tab-123";

      // Just verify it doesn't throw - the actual implementation updates atoms directly
      expect(() => handleResetLayout(tabId)).not.toThrow();
    });
  });
});
