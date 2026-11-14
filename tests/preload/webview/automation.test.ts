import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { describeElement } from "../../../src/preload/webview/api/selectors";

// Bun's jsdom globals lack CSS.escape, which the webview's Chromium provides.
const { CSS: DomCSS } = globalThis;
beforeAll(() => {
  globalThis.CSS = { escape: (value: string) => value } as typeof CSS;
});
afterAll(() => {
  globalThis.CSS = DomCSS;
});

describe("browser automation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
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
