import type {
  BrowserClickArgs,
  BrowserElementDescriptor,
  BrowserFocusArgs,
  BrowserHoverArgs,
  BrowserKeysArgs,
  BrowserQueryArgs,
  BrowserScrollArgs,
  BrowserTypeArgs,
  BrowserWaitArgs,
} from "@shared/cli/browser";
import { handles } from "./handlesRegistry";
import { describeElement } from "./selectors";

function waitForSelector(selector: string, timeout?: number): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(true);
      return;
    }

    const timeoutTimer = setTimeout(() => {
      observer.disconnect();
      reject(new Error("Wait for selector timeout"));
    }, timeout ?? 5000);

    const observer = new MutationObserver(() => {
      const node = document.querySelector(selector);
      if (node) {
        clearTimeout(timeoutTimer);
        observer.disconnect();
        resolve(true);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  });
}

function scrollElementIntoView(element: Element) {
  if (typeof (element as HTMLElement).scrollIntoView === "function") {
    (element as HTMLElement).scrollIntoView({
      block: "center",
      behavior: "instant",
    });
  }
}

// Each button's `button` index, its bit in `buttons` while pressed, and the
// event a browser fires for it in place of a plain click.
const BUTTONS = {
  left: { button: 0, buttons: 1, click: "click" },
  middle: { button: 1, buttons: 4, click: "auxclick" },
  right: { button: 2, buttons: 2, click: "contextmenu" },
} as const;

function dispatchMouseEvent(
  element: Element,
  type: string,
  init: MouseEventInit,
) {
  element.dispatchEvent(new MouseEvent(type, init));
}

export const automation = {
  async query(payload?: BrowserQueryArgs): Promise<BrowserElementDescriptor[]> {
    const {
      selector = "*",
      contextHandle,
      text,
      role,
      maxResults = 50,
      timeout,
      dumpTree,
    } = payload ?? {};

    const root = contextHandle
      ? handles.resolve(contextHandle)
      : document.documentElement;

    const runQuery = (): BrowserElementDescriptor[] => {
      if (dumpTree) {
        const tree: Array<BrowserElementDescriptor | null> = [];
        const walker = document.createTreeWalker(
          document.body ?? document.documentElement,
          NodeFilter.SHOW_ELEMENT,
        );
        let current: Node | null = walker.currentNode;
        while (current && tree.length < maxResults) {
          tree.push(describeElement(current as Element));
          current = walker.nextNode();
        }
        return tree.filter(Boolean) as BrowserElementDescriptor[];
      }

      const matches = Array.from(root.querySelectorAll(selector)).filter(
        (node) => {
          if (role && (node as Element).getAttribute("role") !== role) {
            return false;
          }
          if (text) {
            const content =
              (node.textContent ?? "") +
              ("value" in node &&
              typeof (node as HTMLInputElement).value === "string"
                ? (node as HTMLInputElement).value
                : "");
            if (!content.toLowerCase().includes(text.toLowerCase())) {
              return false;
            }
          }
          return true;
        },
      );

      return matches
        .slice(0, maxResults)
        .map((node) => describeElement(node))
        .filter(Boolean) as BrowserElementDescriptor[];
    };

    // A timeout waits up to that long for a first match. Polling, unlike a
    // MutationObserver, also sees input values that --text matches against.
    const deadline = Date.now() + (timeout ?? 0);
    let results = runQuery();
    while (results.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(100, deadline - Date.now())),
      );
      results = runQuery();
    }

    return results;
  },

  click(payload: BrowserClickArgs) {
    const { handle, button = "left", clicks = 1, offset } = payload ?? {};
    const element = handles.resolve(handle);

    if (typeof (element as HTMLElement).focus === "function") {
      (element as HTMLElement).focus();
    }
    scrollElementIntoView(element);

    const rect = element.getBoundingClientRect();
    const init: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + (offset?.x ?? rect.width / 2),
      clientY: rect.top + (offset?.y ?? rect.height / 2),
      button: BUTTONS[button].button,
    };
    const pressed = { ...init, buttons: BUTTONS[button].buttons };
    const pointer = { pointerId: 1, pointerType: "mouse", isPrimary: true };

    // Like a person's clicks: each pointer event precedes its mouse event, a
    // canceled pointerdown suppresses mousedown and mouseup, `detail` counts
    // up, and the second left click also fires a dblclick.
    for (let detail = 1; detail <= clicks; detail++) {
      const mouseEvents = element.dispatchEvent(
        new PointerEvent("pointerdown", { ...pressed, ...pointer }),
      );
      if (mouseEvents) {
        element.dispatchEvent(
          new MouseEvent("mousedown", { ...pressed, detail }),
        );
      }
      element.dispatchEvent(
        new PointerEvent("pointerup", { ...init, ...pointer }),
      );
      if (mouseEvents) {
        element.dispatchEvent(new MouseEvent("mouseup", { ...init, detail }));
      }
      element.dispatchEvent(
        new MouseEvent(BUTTONS[button].click, { ...init, detail }),
      );
      if (detail === 2 && button === "left") {
        element.dispatchEvent(new MouseEvent("dblclick", { ...init, detail }));
      }
    }
  },

  async type(payload: BrowserTypeArgs) {
    const { handle, text = "", submit, delay = 0, replace } = payload ?? {};
    const element = handles.resolve(handle);

    if (typeof (element as HTMLElement).focus === "function") {
      (element as HTMLElement).focus();
    }

    const applyValue = (next: string) => {
      if ("value" in element) {
        (element as HTMLInputElement).value = next;
        element.dispatchEvent(
          new Event("input", { bubbles: true, cancelable: true }),
        );
      } else {
        (element as HTMLElement).textContent = next;
      }
    };

    const currentValue =
      "value" in element &&
      typeof (element as HTMLInputElement).value === "string"
        ? (element as HTMLInputElement).value
        : (element.textContent ?? "");

    let nextValue = replace ? text : currentValue + text;

    if (delay > 0 && text.length > 0) {
      nextValue = replace ? "" : currentValue;
      for (const char of text) {
        nextValue += char;
        applyValue(nextValue);
        if (delay) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    } else {
      applyValue(nextValue);
    }

    if (submit) {
      const enter = new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      });
      element.dispatchEvent(enter);
    }
  },

  keys(payload: BrowserKeysArgs) {
    const active =
      (document.activeElement as HTMLElement | null) ?? document.body;
    for (const key of payload.keys ?? []) {
      const down = new KeyboardEvent("keydown", { key, bubbles: true });
      const up = new KeyboardEvent("keyup", { key, bubbles: true });
      active.dispatchEvent(down);
      active.dispatchEvent(up);
    }
  },

  scroll(payload?: BrowserScrollArgs) {
    const { handle, x, y, direction, smooth } = payload ?? {};
    const target = handle ? handles.resolve(handle) : null;
    const behavior: ScrollBehavior = smooth ? "smooth" : "auto";

    // Determine sign based on direction (negative for up/left, positive for down/right)
    const xSign = direction === "left" ? -1 : direction === "right" ? 1 : 1;
    const ySign = direction === "up" ? -1 : direction === "down" ? 1 : 1;

    // Use provided value with direction sign, or default to 200 if direction is set
    const scrollX =
      x !== undefined
        ? x * xSign
        : direction === "left" || direction === "right"
          ? 200 * xSign
          : 0;
    const scrollY =
      y !== undefined
        ? y * ySign
        : direction === "up" || direction === "down"
          ? 200 * ySign
          : 0;

    if (target && typeof (target as HTMLElement).scrollBy === "function") {
      (target as HTMLElement).scrollBy({
        left: scrollX,
        top: scrollY,
        behavior,
      });
    } else {
      window.scrollBy({ left: scrollX, top: scrollY, behavior });
    }
  },

  async wait({
    state,
    selector,
    timeout = 5000,
  }: BrowserWaitArgs): Promise<void> {
    if (state === "domcontentloaded") {
      if (document.readyState !== "loading") return;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("ERR_TIMEOUT")),
          timeout,
        );
        document.addEventListener(
          "DOMContentLoaded",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
      return;
    }

    if (selector) {
      await waitForSelector(selector, timeout);
      return;
    }

    if (state === "networkidle") {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  },

  hover({ handle, offset }: BrowserHoverArgs) {
    const element = handles.resolve(handle);

    scrollElementIntoView(element);

    const rect = element.getBoundingClientRect();
    const clientX = rect.left + (offset?.x ?? rect.width / 2);
    const clientY = rect.top + (offset?.y ?? rect.height / 2);

    const init: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY,
    };

    ["pointerenter", "pointerover", "mousemove", "mouseover"].forEach((type) =>
      dispatchMouseEvent(element, type, init),
    );
  },

  focus({ handle, scroll = true }: BrowserFocusArgs) {
    const element = handles.resolve(handle) as HTMLElement;

    if (scroll) {
      scrollElementIntoView(element);
    }

    element.focus?.();
  },
};

window.addEventListener("beforeunload", () => handles.clear());

export default automation;
