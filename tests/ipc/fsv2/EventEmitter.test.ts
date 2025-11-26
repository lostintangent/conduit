import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventEmitter } from "../../../src/ipc/fsv2/utils/EventEmitter";

describe("EventEmitter", () => {
  let emitter: EventEmitter<string>;

  beforeEach(() => {
    emitter = new EventEmitter<string>();
  });

  describe("event subscription", () => {
    it("should allow subscribing to events", () => {
      const listener = vi.fn();

      emitter.event(listener);

      expect(emitter.listenerCount).toBe(1);
    });

    it("should allow multiple subscribers", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      emitter.event(listener1);
      emitter.event(listener2);
      emitter.event(listener3);

      expect(emitter.listenerCount).toBe(3);
    });

    it("should not add duplicate listeners", () => {
      const listener = vi.fn();

      emitter.event(listener);
      emitter.event(listener);

      expect(emitter.listenerCount).toBe(1);
    });

    it("should return a disposable for unsubscribing", () => {
      const listener = vi.fn();

      const subscription = emitter.event(listener);

      expect(subscription).toHaveProperty("dispose");
      expect(typeof subscription.dispose).toBe("function");
    });
  });

  describe("fire()", () => {
    it("should notify all subscribers when fired", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      emitter.event(listener1);
      emitter.event(listener2);

      emitter.fire("test-data");

      expect(listener1).toHaveBeenCalledWith("test-data");
      expect(listener2).toHaveBeenCalledWith("test-data");
    });

    it("should call listeners in subscription order", () => {
      const callOrder: number[] = [];

      emitter.event(() => callOrder.push(1));
      emitter.event(() => callOrder.push(2));
      emitter.event(() => callOrder.push(3));

      emitter.fire("test");

      expect(callOrder).toEqual([1, 2, 3]);
    });

    it("should pass the correct data to listeners", () => {
      const listener = vi.fn();
      emitter.event(listener);

      emitter.fire("first");
      emitter.fire("second");
      emitter.fire("third");

      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener).toHaveBeenNthCalledWith(1, "first");
      expect(listener).toHaveBeenNthCalledWith(2, "second");
      expect(listener).toHaveBeenNthCalledWith(3, "third");
    });

    it("should not throw when firing with no listeners", () => {
      expect(() => {
        emitter.fire("test");
      }).not.toThrow();
    });

    it("should continue notifying other listeners if one throws", () => {
      const errorListener = vi.fn(() => {
        throw new Error("Listener error");
      });
      const normalListener = vi.fn();

      // Suppress console.error for this test
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      emitter.event(errorListener);
      emitter.event(normalListener);

      emitter.fire("test");

      expect(errorListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("unsubscribe via dispose()", () => {
    it("should stop receiving events after dispose", () => {
      const listener = vi.fn();

      const subscription = emitter.event(listener);
      emitter.fire("before");

      subscription.dispose();
      emitter.fire("after");

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith("before");
    });

    it("should allow disposing multiple times without error", () => {
      const listener = vi.fn();
      const subscription = emitter.event(listener);

      expect(() => {
        subscription.dispose();
        subscription.dispose();
        subscription.dispose();
      }).not.toThrow();
    });

    it("should only remove the specific listener", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const subscription1 = emitter.event(listener1);
      emitter.event(listener2);

      subscription1.dispose();
      emitter.fire("test");

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledWith("test");
    });

    it("should handle unsubscribing during event firing", () => {
      const listener1 = vi.fn();
      // Using let here because we need to assign in a callback before using
      // eslint-disable-next-line prefer-const
      let subscription2: ReturnType<typeof emitter.event>;

      const unsubscribingListener = vi.fn(() => {
        subscription2.dispose();
      });
      const listener3 = vi.fn();

      emitter.event(listener1);
      subscription2 = emitter.event(unsubscribingListener);
      emitter.event(listener3);

      // This should not throw even though unsubscribingListener
      // disposes subscription2 during iteration
      emitter.fire("test");

      expect(listener1).toHaveBeenCalled();
      expect(unsubscribingListener).toHaveBeenCalled();
      expect(listener3).toHaveBeenCalled();
    });
  });

  describe("hasListeners()", () => {
    it("should return false when no listeners", () => {
      expect(emitter.hasListeners()).toBe(false);
    });

    it("should return true when listeners exist", () => {
      emitter.event(() => {});

      expect(emitter.hasListeners()).toBe(true);
    });

    it("should return false after all listeners removed", () => {
      const subscription = emitter.event(() => {});

      expect(emitter.hasListeners()).toBe(true);

      subscription.dispose();

      expect(emitter.hasListeners()).toBe(false);
    });
  });

  describe("listenerCount", () => {
    it("should return 0 when no listeners", () => {
      expect(emitter.listenerCount).toBe(0);
    });

    it("should track listener count correctly", () => {
      const sub1 = emitter.event(() => {});
      expect(emitter.listenerCount).toBe(1);

      const sub2 = emitter.event(() => {});
      expect(emitter.listenerCount).toBe(2);

      sub1.dispose();
      expect(emitter.listenerCount).toBe(1);

      sub2.dispose();
      expect(emitter.listenerCount).toBe(0);
    });
  });

  describe("dispose()", () => {
    it("should clear all listeners", () => {
      emitter.event(() => {});
      emitter.event(() => {});
      emitter.event(() => {});

      expect(emitter.listenerCount).toBe(3);

      emitter.dispose();

      expect(emitter.listenerCount).toBe(0);
    });

    it("should prevent new subscriptions after dispose", () => {
      emitter.dispose();

      const listener = vi.fn();
      const subscription = emitter.event(listener);

      // Should return a no-op disposable
      expect(subscription).toHaveProperty("dispose");

      emitter.fire("test");

      // Listener should not have been called
      expect(listener).not.toHaveBeenCalled();
    });

    it("should make fire() a no-op after dispose", () => {
      const listener = vi.fn();
      emitter.event(listener);

      emitter.dispose();
      emitter.fire("test");

      expect(listener).not.toHaveBeenCalled();
    });

    it("should be safe to call multiple times", () => {
      expect(() => {
        emitter.dispose();
        emitter.dispose();
        emitter.dispose();
      }).not.toThrow();
    });

    it("should handle dispose after subscriptions are disposed", () => {
      const sub1 = emitter.event(() => {});
      const sub2 = emitter.event(() => {});

      sub1.dispose();
      sub2.dispose();

      expect(() => {
        emitter.dispose();
      }).not.toThrow();
    });
  });

  describe("typed events", () => {
    it("should work with complex event types", () => {
      interface ComplexEvent {
        path: string;
        entries: Array<{ name: string; type: "file" | "directory" }>;
        timestamp: number;
      }

      const complexEmitter = new EventEmitter<ComplexEvent>();
      const listener = vi.fn();

      complexEmitter.event(listener);

      const eventData: ComplexEvent = {
        path: "/test/path",
        entries: [
          { name: "file1.ts", type: "file" },
          { name: "src", type: "directory" },
        ],
        timestamp: Date.now(),
      };

      complexEmitter.fire(eventData);

      expect(listener).toHaveBeenCalledWith(eventData);
    });

    it("should work with primitive types", () => {
      const numberEmitter = new EventEmitter<number>();
      const booleanEmitter = new EventEmitter<boolean>();

      const numberListener = vi.fn();
      const booleanListener = vi.fn();

      numberEmitter.event(numberListener);
      booleanEmitter.event(booleanListener);

      numberEmitter.fire(42);
      booleanEmitter.fire(true);

      expect(numberListener).toHaveBeenCalledWith(42);
      expect(booleanListener).toHaveBeenCalledWith(true);
    });

    it("should work with void type (signal-only events)", () => {
      const voidEmitter = new EventEmitter<void>();
      const listener = vi.fn();

      voidEmitter.event(listener);
      voidEmitter.fire();

      expect(listener).toHaveBeenCalledWith(undefined);
    });
  });

  describe("real-world usage patterns", () => {
    it("should support the provider pattern (private emitter, public event)", () => {
      // Simulate how a provider would use the emitter
      class MockProvider {
        private readonly _onChanged = new EventEmitter<string>();
        readonly onChanged = this._onChanged.event;

        triggerChange(data: string) {
          this._onChanged.fire(data);
        }

        dispose() {
          this._onChanged.dispose();
        }
      }

      const provider = new MockProvider();
      const listener = vi.fn();

      provider.onChanged(listener);
      provider.triggerChange("test-data");

      expect(listener).toHaveBeenCalledWith("test-data");

      provider.dispose();
    });

    it("should support multiple independent emitters", () => {
      const emitter1 = new EventEmitter<string>();
      const emitter2 = new EventEmitter<string>();

      const listener1 = vi.fn();
      const listener2 = vi.fn();

      emitter1.event(listener1);
      emitter2.event(listener2);

      emitter1.fire("from-1");
      emitter2.fire("from-2");

      expect(listener1).toHaveBeenCalledWith("from-1");
      expect(listener1).not.toHaveBeenCalledWith("from-2");

      expect(listener2).toHaveBeenCalledWith("from-2");
      expect(listener2).not.toHaveBeenCalledWith("from-1");
    });
  });
});
