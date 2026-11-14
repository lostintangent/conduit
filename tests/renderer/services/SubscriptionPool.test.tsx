import { act, cleanup, render } from "@testing-library/react";
import { Activity, useEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  SubscriptionPool,
  usePooledSubscription,
} from "@/services/SubscriptionPool";

class FakeSubscription {
  released = false;
  suspended = false;

  listen() {
    if (this.released) {
      throw new Error("released");
    }
    return () => {};
  }

  suspend() {
    this.suspended = true;
  }

  resume() {
    this.suspended = false;
  }

  release() {
    this.released = true;
  }
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("resumes the same instance when shown again after a long hide", () => {
  vi.useFakeTimers();
  const pool = new SubscriptionPool(() => new FakeSubscription());
  const seen = new Set<FakeSubscription>();
  const errors: unknown[] = [];
  function Holder() {
    const subscription = usePooledSubscription(pool, "/project");
    seen.add(subscription);
    useEffect(() => {
      try {
        return subscription.listen();
      } catch (error) {
        errors.push(error);
      }
    }, [subscription]);
    return null;
  }
  // Showing a stable element again re-runs its effects but not its render
  const holder = <Holder />;
  const shown = (mode: "visible" | "hidden") => (
    <Activity mode={mode}>{holder}</Activity>
  );

  const { rerender } = render(shown("visible"));
  rerender(shown("hidden"));
  act(() => vi.advanceTimersByTime(6000));
  expect(pool.getRefCount("/project")).toBe(0);
  expect(pool.get("/project").suspended).toBe(true);

  rerender(shown("visible"));

  expect(errors).toEqual([]);
  expect(seen.size).toBe(1);
  expect(pool.getRefCount("/project")).toBe(1);
  expect(pool.get("/project").suspended).toBe(false);
});
