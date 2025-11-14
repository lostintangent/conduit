import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { BaseWatcher } from "../../../../src/ipc/fs/watcher/BaseWatcher";

// Create a concrete test class since BaseWatcher is abstract
class TestWatcher extends BaseWatcher {
  public testDebounce(key: string, delay: number, callback: () => void): void {
    this.debounce(key, delay, callback);
  }

  public testClearDebounceTimers(): void {
    this.clearDebounceTimers();
  }

  public getTimerCount(): number {
    return this.debounceTimers.size;
  }
}

describe("BaseWatcher", () => {
  let watcher: TestWatcher;

  beforeEach(() => {
    vi.useFakeTimers();
    watcher = new TestWatcher();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("debounce()", () => {
    it("should debounce callback execution", () => {
      const callback = vi.fn();

      watcher.testDebounce("test-key", 100, callback);

      // Callback should not execute immediately
      expect(callback).not.toHaveBeenCalled();

      // Advance time to trigger debounce
      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should reset timer on rapid calls with same key", () => {
      const callback = vi.fn();

      // First call
      watcher.testDebounce("test-key", 100, callback);
      vi.advanceTimersByTime(50);

      // Second call (should reset timer)
      watcher.testDebounce("test-key", 100, callback);
      vi.advanceTimersByTime(50);

      // Should not have executed yet (only 100ms total, but timer was reset)
      expect(callback).not.toHaveBeenCalled();

      // Advance remaining 50ms
      vi.advanceTimersByTime(50);

      // Should execute once (last callback only)
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should handle different keys independently", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      watcher.testDebounce("key-1", 100, callback1);
      watcher.testDebounce("key-2", 50, callback2);

      // Advance time to trigger second callback only
      vi.advanceTimersByTime(50);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);

      // Advance time to trigger first callback
      vi.advanceTimersByTime(50);

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it("should cleanup timer after callback executes", () => {
      const callback = vi.fn();

      watcher.testDebounce("test-key", 100, callback);

      expect(watcher.getTimerCount()).toBe(1);

      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(watcher.getTimerCount()).toBe(0);
    });

    it("should handle multiple rapid calls correctly", () => {
      const callback = vi.fn();

      // Rapid fire calls
      watcher.testDebounce("test-key", 100, callback);
      vi.advanceTimersByTime(30);

      watcher.testDebounce("test-key", 100, callback);
      vi.advanceTimersByTime(30);

      watcher.testDebounce("test-key", 100, callback);
      vi.advanceTimersByTime(30);

      // Should not have executed yet (90ms total, but timer keeps resetting)
      expect(callback).not.toHaveBeenCalled();

      // Advance the final 70ms (100ms from last call)
      vi.advanceTimersByTime(70);

      // Should execute exactly once
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should handle different delays for different keys", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      watcher.testDebounce("key-1", 50, callback1);
      watcher.testDebounce("key-2", 100, callback2);
      watcher.testDebounce("key-3", 150, callback3);

      // After 50ms
      vi.advanceTimersByTime(50);
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).not.toHaveBeenCalled();
      expect(callback3).not.toHaveBeenCalled();

      // After 100ms total
      vi.advanceTimersByTime(50);
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback3).not.toHaveBeenCalled();

      // After 150ms total
      vi.advanceTimersByTime(50);
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback3).toHaveBeenCalledTimes(1);
    });
  });

  describe("clearDebounceTimers()", () => {
    it("should clear all pending timers", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      watcher.testDebounce("key-1", 100, callback1);
      watcher.testDebounce("key-2", 100, callback2);
      watcher.testDebounce("key-3", 100, callback3);

      expect(watcher.getTimerCount()).toBe(3);

      watcher.testClearDebounceTimers();

      expect(watcher.getTimerCount()).toBe(0);

      // Callbacks should not execute even after delay
      vi.advanceTimersByTime(100);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
      expect(callback3).not.toHaveBeenCalled();
    });

    it("should handle clearing when no timers exist", () => {
      expect(() => {
        watcher.testClearDebounceTimers();
      }).not.toThrow();

      expect(watcher.getTimerCount()).toBe(0);
    });

    it("should allow new debounce after clearing", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      watcher.testDebounce("key-1", 100, callback1);
      watcher.testClearDebounceTimers();

      // Add new debounce after clearing
      watcher.testDebounce("key-2", 50, callback2);

      vi.advanceTimersByTime(50);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });

  describe("edge cases", () => {
    it("should handle zero delay", () => {
      const callback = vi.fn();

      watcher.testDebounce("test-key", 0, callback);

      vi.advanceTimersByTime(0);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should handle very long delays", () => {
      const callback = vi.fn();

      watcher.testDebounce("test-key", 10000, callback);

      vi.advanceTimersByTime(9999);
      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should handle special characters in keys", () => {
      const callback = vi.fn();

      watcher.testDebounce("key:with:colons", 100, callback);
      watcher.testDebounce("key/with/slashes", 100, callback);
      watcher.testDebounce("key with spaces", 100, callback);

      expect(watcher.getTimerCount()).toBe(3);

      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalledTimes(3);
    });

    it("should handle callback that throws error", () => {
      const errorCallback = vi.fn(() => {
        throw new Error("Callback error");
      });

      watcher.testDebounce("test-key", 100, errorCallback);

      // Should throw when callback executes
      expect(() => {
        vi.advanceTimersByTime(100);
      }).toThrow("Callback error");

      // Callback should have been called despite error
      expect(errorCallback).toHaveBeenCalledTimes(1);
    });

    it("should handle replacing callback before execution", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      watcher.testDebounce("test-key", 100, callback1);
      vi.advanceTimersByTime(50);

      // Replace with different callback (resets timer)
      watcher.testDebounce("test-key", 100, callback2);
      vi.advanceTimersByTime(100);

      // Only the second callback should execute
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });
});
