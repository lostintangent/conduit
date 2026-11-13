import { describe, it, expect, beforeEach } from "vitest";
import { ContextKeyService } from "@/commands/contextKeys/ContextKeyServiceImpl";

describe("ContextKeyService", () => {
  let service: ContextKeyService;

  beforeEach(() => {
    service = new ContextKeyService();
  });

  describe("setGlobal and getAll", () => {
    it("should return all global values", () => {
      service.setGlobal("key1", "value1");
      service.setGlobal("key2", 42);
      service.setGlobal("key3", true);

      expect(service.getAll()).toEqual({
        key1: "value1",
        key2: 42,
        key3: true,
      });
    });
  });

  describe("change notifications", () => {
    it("should notify listeners on global value change", () => {
      let notifiedKey: string | null = null;
      let notifiedValue: unknown = null;

      const dispose = service.onDidChangeContext((key, value) => {
        notifiedKey = key;
        notifiedValue = value;
      });

      service.setGlobal("testKey", "testValue");

      expect(notifiedKey).toBe("testKey");
      expect(notifiedValue).toBe("testValue");

      dispose();
    });

    it("should notify multiple listeners", () => {
      let count = 0;

      const dispose1 = service.onDidChangeContext(() => count++);
      const dispose2 = service.onDidChangeContext(() => count++);

      service.setGlobal("key", "value");

      expect(count).toBe(2);

      dispose1();
      dispose2();
    });

    it("should not notify when the value is unchanged", () => {
      let count = 0;
      service.onDidChangeContext(() => count++);

      service.setGlobal("key", "value");
      service.setGlobal("key", "value");

      expect(count).toBe(1);
    });

    it("should stop notifying after disposal", () => {
      let count = 0;

      const dispose = service.onDidChangeContext(() => count++);

      service.setGlobal("key1", "value1");
      expect(count).toBe(1);

      dispose();

      service.setGlobal("key2", "value2");
      expect(count).toBe(1); // Should not increment
    });
  });
});
