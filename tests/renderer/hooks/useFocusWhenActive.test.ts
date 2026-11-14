import { useFocusWhenActive } from "@/hooks/useFocusWhenActive";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("useFocusWhenActive", () => {
  let frames: FrameRequestCallback[];
  let pane: HTMLDivElement;
  let input: HTMLInputElement;
  let outside: HTMLButtonElement;

  const flushFrame = () => frames.splice(0).forEach((frame) => frame(0));

  const renderActivation = (focus = () => input.focus()) => {
    const paneRef = { current: pane };
    const hook = renderHook(
      ({ isActive }) => useFocusWhenActive(isActive, paneRef, focus),
      { initialProps: { isActive: false } },
    );
    hook.rerender({ isActive: true });
  };

  beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) =>
      frames.push(frame),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      delete frames[id - 1];
    });

    pane = document.createElement("div");
    input = document.createElement("input");
    pane.append(input);
    outside = document.createElement("button");
    document.body.append(pane, outside);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("moves focus into the pane when it becomes active", () => {
    outside.focus();
    renderActivation();
    expect(document.activeElement).toBe(outside);

    flushFrame();
    expect(document.activeElement).toBe(input);
  });

  it("leaves focus alone when it's already inside the pane", () => {
    const other = document.createElement("button");
    pane.append(other);
    other.focus();

    renderActivation();
    flushFrame();
    expect(document.activeElement).toBe(other);
  });

  it("leaves a menu outside the pane focused", () => {
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    menu.append(outside);
    document.body.append(menu);
    outside.focus();

    renderActivation();
    flushFrame();
    expect(document.activeElement).toBe(outside);
  });

  it("focuses a pane that's inside the focused dialog", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.append(outside, pane);
    document.body.append(dialog);
    outside.focus();

    renderActivation();
    flushFrame();
    expect(document.activeElement).toBe(input);
  });

  // Focusing hidden content is a no-op in the browser
  const focusOnceShown = () => {
    let isShown = false;
    renderActivation(() => isShown && input.focus());
    return () => (isShown = true);
  };

  it("retries while the pane's content is still hidden", () => {
    const show = focusOnceShown();
    flushFrame();
    expect(document.activeElement).toBe(document.body);

    show();
    flushFrame();
    expect(document.activeElement).toBe(input);
  });

  it("keeps retrying while focus stays in the pane it came from", () => {
    outside.focus();
    const show = focusOnceShown();
    flushFrame();
    expect(document.activeElement).toBe(outside);

    show();
    flushFrame();
    expect(document.activeElement).toBe(input);
  });

  it("tells the last try that the pane has settled", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const focus = vi.fn();
    renderActivation(focus);

    flushFrame();
    now = 1000;
    flushFrame();
    expect(focus.mock.calls).toEqual([[false], [true]]);
    expect(frames.filter(Boolean)).toHaveLength(0);
  });

  it("stops retrying once focus moves somewhere else", () => {
    const show = focusOnceShown();
    flushFrame();

    show();
    outside.focus();
    flushFrame();
    expect(document.activeElement).toBe(outside);
    expect(frames.filter(Boolean)).toHaveLength(0);
  });
});
