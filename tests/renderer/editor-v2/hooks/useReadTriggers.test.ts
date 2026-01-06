/**
 * Tests for useReadTriggers hook.
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  READ_TRIGGER_ACTIONS,
  useReadTriggers,
} from "@/components/panes/editor-v2/hooks/useReadTriggers";

describe("useReadTriggers", () => {
  describe("READ_TRIGGER_ACTIONS", () => {
    it("should contain all expected action types", () => {
      expect(READ_TRIGGER_ACTIONS).toContain("file:select");
      expect(READ_TRIGGER_ACTIONS).toContain("file:focus");
      expect(READ_TRIGGER_ACTIONS).toContain("file:stage");
      expect(READ_TRIGGER_ACTIONS).toContain("file:unstage");
      expect(READ_TRIGGER_ACTIONS).toContain("file:revert");
      expect(READ_TRIGGER_ACTIONS).toContain("file:expand");
      expect(READ_TRIGGER_ACTIONS).toContain("file:collapse");
    });

    it("should have exactly 7 action types", () => {
      expect(READ_TRIGGER_ACTIONS).toHaveLength(7);
    });
  });

  describe("triggerRead", () => {
    it("should call markSeen with the provided path", () => {
      const mockMarkSeen = vi.fn();
      const { result } = renderHook(() => useReadTriggers(mockMarkSeen));

      act(() => {
        result.current.triggerRead("file:select", "src/file.ts");
      });

      expect(mockMarkSeen).toHaveBeenCalledTimes(1);
      expect(mockMarkSeen).toHaveBeenCalledWith("src/file.ts");
    });

    it("should call markSeen for each action type", () => {
      const mockMarkSeen = vi.fn();
      const { result } = renderHook(() => useReadTriggers(mockMarkSeen));

      act(() => {
        result.current.triggerRead("file:select", "file1.ts");
        result.current.triggerRead("file:focus", "file2.ts");
        result.current.triggerRead("file:stage", "file3.ts");
        result.current.triggerRead("file:unstage", "file4.ts");
        result.current.triggerRead("file:revert", "file5.ts");
        result.current.triggerRead("file:expand", "file6.ts");
        result.current.triggerRead("file:collapse", "file7.ts");
      });

      expect(mockMarkSeen).toHaveBeenCalledTimes(7);
      expect(mockMarkSeen).toHaveBeenCalledWith("file1.ts");
      expect(mockMarkSeen).toHaveBeenCalledWith("file2.ts");
      expect(mockMarkSeen).toHaveBeenCalledWith("file3.ts");
      expect(mockMarkSeen).toHaveBeenCalledWith("file4.ts");
      expect(mockMarkSeen).toHaveBeenCalledWith("file5.ts");
      expect(mockMarkSeen).toHaveBeenCalledWith("file6.ts");
      expect(mockMarkSeen).toHaveBeenCalledWith("file7.ts");
    });

    it("should not throw when markSeen is undefined", () => {
      const { result } = renderHook(() => useReadTriggers(undefined));

      expect(() => {
        act(() => {
          result.current.triggerRead("file:select", "src/file.ts");
        });
      }).not.toThrow();
    });

    it("should return stable triggerRead function when markSeen is unchanged", () => {
      const mockMarkSeen = vi.fn();
      const { result, rerender } = renderHook(() =>
        useReadTriggers(mockMarkSeen),
      );

      const firstTriggerRead = result.current.triggerRead;
      rerender();
      const secondTriggerRead = result.current.triggerRead;

      expect(firstTriggerRead).toBe(secondTriggerRead);
    });

    it("should update triggerRead function when markSeen changes", () => {
      const mockMarkSeen1 = vi.fn();
      const mockMarkSeen2 = vi.fn();
      const { result, rerender } = renderHook(
        ({ markSeen }) => useReadTriggers(markSeen),
        { initialProps: { markSeen: mockMarkSeen1 } },
      );

      const firstTriggerRead = result.current.triggerRead;
      rerender({ markSeen: mockMarkSeen2 });
      const secondTriggerRead = result.current.triggerRead;

      // Function should have changed because dependency changed
      expect(firstTriggerRead).not.toBe(secondTriggerRead);

      // New function should use new markSeen
      act(() => {
        result.current.triggerRead("file:select", "test.ts");
      });

      expect(mockMarkSeen1).not.toHaveBeenCalled();
      expect(mockMarkSeen2).toHaveBeenCalledWith("test.ts");
    });
  });
});
