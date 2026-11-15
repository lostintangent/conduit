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
    workbench: { openExternal: vi.fn() },
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

/** What the latest terminal gave its web links addon */
const webLinks = vi.hoisted(() => ({
  click: (_event: MouseEvent, _url: string) => {},
  options: {} as {
    hover?: (event: MouseEvent, url: string) => void;
    leave?: (event: MouseEvent, url: string) => void;
  },
}));
vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: class {
    constructor(
      click: typeof webLinks.click,
      options: typeof webLinks.options = {},
    ) {
      Object.assign(webLinks, { click, options });
    }
    activate() {}
    dispose() {}
  },
}));

import type { UserSettings } from "@features/settings/model";
import { activeTabIdAtom, tabsAtom } from "@features/workbench/client/atoms";
import type { Tab } from "@features/workbench/model";
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
  // xterm measures glyphs on a 2D canvas when it opens, which happy-dom lacks.
  beforeEach(() => {
    vi.spyOn(OffscreenCanvas.prototype, "getContext").mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 8 }),
    } as unknown as OffscreenCanvasRenderingContext2D);
  });

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
    vi.restoreAllMocks();
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

describe("a terminal's links", () => {
  const url = "https://example.com";
  const click = (modifiers: MouseEventInit = {}) =>
    webLinks.click(new MouseEvent("mouseup", modifiers), url);

  beforeEach(() => {
    vi.spyOn(OffscreenCanvas.prototype, "getContext").mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 8 }),
    } as unknown as OffscreenCanvasRenderingContext2D);
  });

  afterEach(() => {
    disposeSession("links");
    api.workbench.openExternal.mockClear();
    vi.restoreAllMocks();
  });

  it("open on Cmd-click, and in a new pane on Cmd-Shift-click", () => {
    const follow = vi.fn();
    getOrCreate("links", "links", settings).setLinkHandler(follow);

    click();
    click({ shiftKey: true });
    click({ metaKey: true });
    click({ metaKey: true, shiftKey: true });

    expect(follow.mock.calls).toEqual([
      [url, false],
      [url, true],
    ]);
  });

  it("include the hyperlinks programs print, which open and look clickable the same way", () => {
    const { terminal, setLinkHandler } = getOrCreate(
      "links",
      "links",
      settings,
    );
    const follow = vi.fn();
    setLinkHandler(follow);
    attach("links", document.body.appendChild(document.createElement("div")));
    const hyperlinks = terminal.options.linkHandler!;
    const range = { start: { x: 1, y: 1 }, end: { x: 5, y: 1 } };

    // Without a handler, xterm asks with confirm() and then opens a window
    hyperlinks.activate(new MouseEvent("mouseup"), url, range);
    hyperlinks.activate(
      new MouseEvent("mouseup", { metaKey: true }),
      url,
      range,
    );
    hyperlinks.hover!(new MouseEvent("mousemove"), url, range);

    expect(follow.mock.calls).toEqual([[url, false]]);
    expect(terminal.element!.classList).toContain("xterm-link-needs-cmd");
  });

  it("open in the default browser on Cmd-click without a handler", () => {
    getOrCreate("links", "links", settings);

    click();
    click({ metaKey: true });

    expect(api.workbench.openExternal).toHaveBeenCalledExactlyOnceWith(url);
  });

  it("look clickable only while Cmd is down", () => {
    const { terminal } = getOrCreate("links", "links", settings);
    attach("links", document.body.appendChild(document.createElement("div")));
    const needsCmd = () =>
      terminal.element!.classList.contains("xterm-link-needs-cmd");
    const press = (type: "keydown" | "keyup", metaKey: boolean) =>
      window.dispatchEvent(new KeyboardEvent(type, { key: "Meta", metaKey }));
    // Cmd pressed while a page has the keys only shows as the pointer moves
    const move = (metaKey: boolean) =>
      terminal.element!.dispatchEvent(new MouseEvent("mousemove", { metaKey }));

    webLinks.options.hover!(new MouseEvent("mousemove"), url);
    expect(needsCmd()).toBe(true);
    press("keydown", true);
    expect(needsCmd()).toBe(false);
    press("keyup", false);
    expect(needsCmd()).toBe(true);
    move(true);
    expect(needsCmd()).toBe(false);
    move(false);
    expect(needsCmd()).toBe(true);

    webLinks.options.leave!(new MouseEvent("mousemove"), url);
    expect(needsCmd()).toBe(false);
    press("keyup", false);
    move(false);
    expect(needsCmd()).toBe(false);

    webLinks.options.hover!(
      new MouseEvent("mousemove", { metaKey: true }),
      url,
    );
    expect(needsCmd()).toBe(false);
  });

  it("keep a Cmd-click on one from their pane, which takes it as entering focus mode", () => {
    const pane = document.body.appendChild(document.createElement("div"));
    const { terminal } = getOrCreate("links", "links", settings);
    attach("links", pane);
    const xtermScreen = terminal.element!.querySelector(".xterm-screen")!;
    const reachesPane = vi.fn();
    pane.addEventListener("mousedown", reachesPane);
    const mousedown = (modifiers: MouseEventInit = {}) =>
      xtermScreen.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, ...modifiers }),
      );

    mousedown({ metaKey: true });
    // As xterm marks its screen while a link is hovered
    xtermScreen.classList.add("xterm-cursor-pointer");
    mousedown();
    mousedown({ metaKey: true });
    mousedown({ metaKey: true, shiftKey: true });

    expect(reachesPane).toHaveBeenCalledTimes(2);
    pane.remove();
  });

  it("stop watching for Cmd once their terminal closes while one is hovered", () => {
    getOrCreate("links", "links", settings);
    attach("links", document.body.appendChild(document.createElement("div")));
    webLinks.options.hover!(new MouseEvent("mousemove"), url);
    const stopListening = vi.spyOn(window, "removeEventListener");

    disposeSession("links");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Meta" }));

    expect(stopListening).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
      true,
    );
    expect(stopListening).toHaveBeenCalledWith(
      "keyup",
      expect.any(Function),
      true,
    );
  });
});

describe("a synchronized tab", () => {
  afterEach(() => {
    disposeSession("left");
    disposeSession("right");
    tabsAtom.set([]);
    activeTabIdAtom.set(null);
    api.terminal.input.mockClear();
  });

  it("sends what's typed in its active pane to every pane's shell", () => {
    const pane = (id: string) => ({
      id,
      type: "terminal" as const,
      sessionId: id,
      cwd: null,
    });
    tabsAtom.set([
      {
        id: "tab",
        name: "Tab",
        synchronized: true,
        activePaneId: "left",
        panes: { left: pane("left"), right: pane("right") },
        layout: { id: "layout", type: "pane", paneId: "left" },
      } as Tab,
    ]);
    activeTabIdAtom.set("tab");
    const left = getOrCreate("left", "left", settings).terminal;
    const right = getOrCreate("right", "right", settings).terminal;

    left.input("ls\r");
    right.input("x");

    expect(api.terminal.input.mock.calls).toEqual([
      ["left", "ls\r"],
      ["right", "ls\r"],
      ["right", "x"],
    ]);
  });
});
