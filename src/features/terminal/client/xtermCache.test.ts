import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => {
  const api = {
    terminal: {
      on: vi.fn(),
      ack: vi.fn(),
      input: vi.fn(),
      ready: vi.fn(),
      resize: vi.fn(),
    },
    openExternal: vi.fn(),
  };
  Object.assign(window, { conduit: api });
  return api;
});

import type { UserSettings } from "@features/settings/model";
import { disposeSession, getOrCreate } from "./xtermCache";

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
