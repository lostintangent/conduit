import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { automation } from "../../../src/preload/webview/api/automation";
import { describeElement } from "../../../src/preload/webview/api/selectors";

// Bun's jsdom globals reject `view: window` and lack CSS.escape, both of
// which the webview's Chromium provides.
const { MouseEvent: DomMouseEvent, CSS: DomCSS } = globalThis;
beforeAll(() => {
  globalThis.MouseEvent = class extends DomMouseEvent {
    constructor(type: string, { view: _, ...init }: MouseEventInit = {}) {
      super(type, init);
    }
  };
  globalThis.CSS = { escape: (value: string) => value } as typeof CSS;
});
afterAll(() => {
  globalThis.MouseEvent = DomMouseEvent;
  globalThis.CSS = DomCSS;
});

function handleFor(element: Element) {
  const descriptor = describeElement(element);
  if (!descriptor) throw new Error("Element has no descriptor");
  return descriptor.handle;
}

function recordMouseEvents(element: Element) {
  const events: string[] = [];
  for (const type of ["mousedown", "mouseup", "click", "dblclick"]) {
    element.addEventListener(type, (event) => {
      events.push(`${type}:${(event as MouseEvent).detail}`);
    });
  }
  return events;
}

describe("browser automation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("click", () => {
    // The CLI always sends an offset object, and API callers may omit it.
    it.each([
      ["an empty offset", {}],
      ["no offset", undefined],
    ])("fires one full click per --clicks, with %s", (_, offset) => {
      const button = document.createElement("button");
      document.body.append(button);
      const events = recordMouseEvents(button);

      automation.click({ handle: handleFor(button), clicks: 2, offset });

      expect(events).toEqual([
        "mousedown:1",
        "mouseup:1",
        "click:1",
        "mousedown:2",
        "mouseup:2",
        "click:2",
        "dblclick:2",
      ]);
    });

    it("fires a single click without a dblclick by default", () => {
      const button = document.createElement("button");
      document.body.append(button);
      const events = recordMouseEvents(button);

      automation.click({ handle: handleFor(button), offset: {} });

      expect(events).toEqual(["mousedown:1", "mouseup:1", "click:1"]);
    });
  });

  describe("element text", () => {
    it.each([
      ["its trimmed label", "<button>\n  Save\n</button>", "Save"],
      [
        "its aria-label without a label",
        '<button aria-label="Close"><svg></svg></button>',
        "Close",
      ],
      ["its value without either", '<button value="go"> </button>', "go"],
    ])("reports a button's text as %s", (_, html, text) => {
      document.body.innerHTML = html;

      expect(describeElement(document.body.firstElementChild)?.text).toBe(text);
    });

    it("reports an input's text as its value", () => {
      document.body.innerHTML = '<input value="hello">';

      expect(describeElement(document.body.firstElementChild)?.text).toBe(
        "hello",
      );
    });
  });
});
