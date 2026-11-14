import { beforeEach, describe, expect, it } from "vitest";
import { automation } from "../../../src/preload/webview/api/automation";
import { describeElement } from "../../../src/preload/webview/api/selectors";

function handleFor(element: Element) {
  const descriptor = describeElement(element);
  if (!descriptor) throw new Error("Element has no descriptor");
  return descriptor.handle;
}

const ALL_CLICK_EVENTS = [
  "pointerdown",
  "mousedown",
  "pointerup",
  "mouseup",
  "click",
  "auxclick",
  "contextmenu",
];

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

    it.each([
      [
        "left",
        ["pointerdown 0/1", "mousedown 0/1", "pointerup 0/0", "mouseup 0/0"],
        "click 0/0",
      ],
      [
        "middle",
        ["pointerdown 1/4", "mousedown 1/4", "pointerup 1/0", "mouseup 1/0"],
        "auxclick 1/0",
      ],
      [
        "right",
        ["pointerdown 2/2", "mousedown 2/2", "pointerup 2/0", "mouseup 2/0"],
        "contextmenu 2/0",
      ],
    ] as const)(
      "sends pointer events and the %s button's click event",
      (button, presses, click) => {
        const target = document.createElement("div");
        document.body.append(target);
        const events: string[] = [];
        for (const type of ALL_CLICK_EVENTS) {
          target.addEventListener(type, (event) => {
            const { button, buttons } = event as MouseEvent;
            events.push(`${type} ${button}/${buttons}`);
          });
        }

        automation.click({ handle: handleFor(target), button, offset: {} });

        expect(events).toEqual([...presses, click]);
      },
    );

    it("opens a menu that toggles on pointerdown, like Radix's trigger", () => {
      const trigger = document.createElement("button");
      document.body.append(trigger);
      let open = false;
      trigger.addEventListener("pointerdown", (event) => {
        if (event.button === 0 && event.pointerType === "mouse") {
          open = !open;
          event.preventDefault();
        }
      });
      const events: string[] = [];
      for (const type of ALL_CLICK_EVENTS) {
        trigger.addEventListener(type, () => events.push(type));
      }

      automation.click({ handle: handleFor(trigger), offset: {} });

      expect(open).toBe(true);
      // A canceled pointerdown suppresses mousedown and mouseup, not click.
      expect(events).toEqual(["pointerdown", "pointerup", "click"]);
    });
  });

  describe("query --timeout", () => {
    it("waits for a match that appears before the timeout", async () => {
      setTimeout(() => {
        const button = document.createElement("button");
        button.textContent = "Save";
        document.body.append(button);
      }, 50);

      const results = await automation.query({
        selector: "button",
        text: "save",
        timeout: 2000,
      });

      expect(results.map((result) => result.text)).toEqual(["Save"]);
    });

    it("returns no matches once the timeout passes", async () => {
      const started = Date.now();

      const results = await automation.query({
        selector: "button",
        timeout: 150,
      });

      expect(results).toEqual([]);
      expect(Date.now() - started).toBeGreaterThanOrEqual(140);
    });

    it("returns immediately without a timeout", async () => {
      const started = Date.now();

      expect(await automation.query({ selector: "button" })).toEqual([]);
      expect(Date.now() - started).toBeLessThan(50);
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
