import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const ipc = vi.hoisted(() => ({
  on: vi.fn(),
  sendToHost: vi.fn(),
}));
vi.mock("electron", () => ({ ipcRenderer: ipc }));

import { clearPressedKeys, parseChord } from "@/commands/keybindings/parser";
import { type AppKey, handAppKeys } from "../../../src/preload/webview/appKeys";

/** Presses a key in the page, returning whether the page could handle it */
function press(
  key: string,
  init: KeyboardEventInit = {},
  { trusted = true, hold = false } = {},
) {
  const keyEvent = (type: string) => {
    const event = new KeyboardEvent(type, {
      key,
      metaKey: true,
      cancelable: true,
      ...init,
    });
    if (trusted) Object.defineProperty(event, "isTrusted", { value: true });
    return event;
  };
  const keydown = keyEvent("keydown");
  let reachedPage = false;
  const page = () => (reachedPage = true);
  window.addEventListener("keydown", page);
  window.dispatchEvent(keydown);
  window.removeEventListener("keydown", page);
  if (!hold) window.dispatchEvent(keyEvent("keyup"));
  return reachedPage && !keydown.defaultPrevented;
}

const handed = () =>
  ipc.sendToHost.mock.calls.map(
    ([, { init, held }]) =>
      `${[...held, init.key].join("+")}${init.shiftKey ? " (shift)" : ""}`,
  );

describe("handAppKeys", () => {
  let setAppKeys: (keys: AppKey[]) => void;
  let now = 0;

  beforeAll(() => {
    handAppKeys();
    const [[, listener]] = ipc.on.mock.calls;
    setAppKeys = (keys) => listener({}, keys);
  });

  beforeEach(() => {
    vi.spyOn(performance, "now").mockImplementation(() => now);
    setAppKeys([
      { chord: parseChord("Cmd+T"), startsChord: false },
      { chord: parseChord("Cmd+K"), startsChord: true },
      { chord: parseChord("Cmd+Shift+B+Left"), startsChord: false },
    ]);
  });

  afterEach(() => {
    window.dispatchEvent(new Event("blur"));
    clearPressedKeys();
    ipc.sendToHost.mockReset();
    vi.restoreAllMocks();
  });

  it("hands the app its keys, and leaves the page the rest", () => {
    expect(press("t")).toBe(false);
    expect(press("y")).toBe(true);
    expect(press("Meta")).toBe(true);

    expect(handed()).toEqual(["t"]);
  });

  it("leaves the page keys its own scripts press", () => {
    expect(press("t", {}, { trusted: false })).toBe(true);
    expect(handed()).toEqual([]);
  });

  it("hands over the keys held with it", () => {
    press("b", { shiftKey: true }, { hold: true });
    expect(press("ArrowLeft", { shiftKey: true })).toBe(false);

    expect(handed()).toEqual(["b+ArrowLeft (shift)"]);
  });

  it("hands over a chord's second key, whatever it is, until the chord times out", () => {
    press("k");
    expect(press("s")).toBe(false);
    expect(press("s")).toBe(true);

    press("k");
    now += 1000;
    expect(press("s")).toBe(true);

    expect(handed()).toEqual(["k", "s", "k"]);
  });

  it("forgets a chord when the page loses focus", () => {
    press("k");
    window.dispatchEvent(new Event("blur"));

    expect(press("s")).toBe(true);
  });

  it("uses the keys the app sent last", () => {
    setAppKeys([{ chord: parseChord("Cmd+Y"), startsChord: false }]);

    expect(press("t")).toBe(true);
    expect(press("y")).toBe(false);
  });
});
