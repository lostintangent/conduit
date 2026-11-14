import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => {
  const api = {
    terminal: {
      on: vi.fn(),
      ack: vi.fn(),
      input: vi.fn(),
      resize: vi.fn(),
      setVisible: vi.fn(),
    },
    openExternal: vi.fn(),
  };
  Object.assign(window, { conduit: api });
  return api;
});

/** Stands in for the browser reporting a pane's terminal on or off screen. */
const screen = vi.hoisted(() => {
  const observers = new Set<FakeIntersectionObserver>();
  class FakeIntersectionObserver {
    targets = new Set<Element>();
    constructor(public callback: (entries: unknown[]) => void) {
      observers.add(this);
    }
    observe(target: Element) {
      this.targets.add(target);
    }
    unobserve(target: Element) {
      this.targets.delete(target);
    }
    disconnect() {
      observers.delete(this);
    }
  }
  Object.assign(window, { IntersectionObserver: FakeIntersectionObserver });
  return {
    show(target: Element, isIntersecting: boolean) {
      for (const observer of observers) {
        if (observer.targets.has(target)) {
          observer.callback([{ target, isIntersecting }]);
        }
      }
    },
  };
});

import type { UserSettings } from "@features/settings/model";
import { attach, disposeSession, getOrCreate } from "./xtermCache";

const settings = {
  terminalFontFamily: "Menlo",
  terminalFontSize: 13,
} as UserSettings;

/** Sends output the way main does, then lets xterm parse it. */
function output(sessionId: string, data: string) {
  const listener = api.terminal.on.mock.calls.find(
    ([event]) => event === "data",
  )?.[1];
  listener?.({ sessionId, data });
  // xterm parses on its next timer tick.
  vi.advanceTimersByTime(1);
}

describe("a terminal's output in the renderer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    disposeSession("session");
    api.terminal.ack.mockClear();
    vi.useRealTimers();
  });

  it("is written to xterm as it arrives", () => {
    const write = vi.spyOn(
      getOrCreate("session", "pane", settings).terminal,
      "write",
    );

    output("session", "hello");
    expect(write).toHaveBeenCalledWith("hello", expect.any(Function));
  });

  it("is acknowledged once parsed, in batches of at least 5,000 characters", () => {
    getOrCreate("session", "pane", settings);

    output("session", "x".repeat(3_000));
    expect(api.terminal.ack).not.toHaveBeenCalled();

    output("session", "x".repeat(3_000));
    expect(api.terminal.ack).toHaveBeenCalledExactlyOnceWith("session", 6_000);
  });

  it("is acknowledged once for a cloned session", () => {
    getOrCreate("session", "pane", settings);
    getOrCreate("session", "clone", settings);

    output("session", "x".repeat(5_000));
    expect(api.terminal.ack).toHaveBeenCalledExactlyOnceWith("session", 5_000);
  });

  it("is acknowledged right away when no pane shows its session", () => {
    getOrCreate("session", "pane", settings);

    output("closed", "x".repeat(5_000));
    expect(api.terminal.ack).toHaveBeenCalledExactlyOnceWith("closed", 5_000);
  });
});

describe("a terminal's visibility", () => {
  /** Creates a pane's terminal and puts it on the page. */
  function open(sessionId: string, paneId: string) {
    const { terminal } = getOrCreate(sessionId, paneId, settings);
    attach(paneId, document.body.appendChild(document.createElement("div")));
    if (!terminal.element) throw new Error(`${paneId} didn't open`);
    return terminal.element;
  }

  afterEach(() => {
    disposeSession("session");
    api.terminal.setVisible.mockClear();
  });

  it("is reported to main when no pane shows a session, and when one does again", () => {
    const pane = open("session", "pane");

    screen.show(pane, false);
    screen.show(pane, false);
    expect(api.terminal.setVisible).toHaveBeenCalledExactlyOnceWith(
      "session",
      false,
    );

    screen.show(pane, true);
    expect(api.terminal.setVisible).toHaveBeenLastCalledWith("session", true);
  });

  it("stays visible while any pane of a cloned session shows", () => {
    const pane = open("session", "pane");
    open("session", "clone");

    screen.show(pane, false);
    expect(api.terminal.setVisible).not.toHaveBeenCalled();

    disposeSession("clone");
    expect(api.terminal.setVisible).toHaveBeenCalledExactlyOnceWith(
      "session",
      false,
    );
  });
});
