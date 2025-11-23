import type {
  AutomationElementDescriptor,
  BrowserClickArgs,
  BrowserFocusArgs,
  BrowserHoverArgs,
  BrowserKeysArgs,
  BrowserQueryArgs,
  BrowserQueryResult,
  BrowserScrollArgs,
  BrowserTypeArgs,
  BrowserWaitArgs,
} from "@shared/cli/browser";
import { handles } from "./handlesRegistry";

const cssEscape = (str: string): string => {
  if (typeof CSS !== "undefined" && CSS.escape) {
    return CSS.escape(str);
  }
  return str.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^{`{|}~]/g, "\\$&");
};

const computeActions = (element: Element): string[] => {
  const actions: string[] = [];
  const tag = element.tagName?.toLowerCase();
  const type = element.getAttribute("type") ?? undefined;

  if (typeof (element as HTMLElement).click === "function") {
    actions.push("clickable");
  }

  if (
    tag === "input" ||
    tag === "textarea" ||
    (element as HTMLElement).isContentEditable
  ) {
    actions.push("typeable");
  }

  if (tag === "a" || type === "submit" || type === "button") {
    actions.push("navigates");
  }

  return actions;
};

const describeAttributes = (element: Element): Record<string, string> => {
  const attributes: Record<string, string> = {};
  for (const attr of element.getAttributeNames()) {
    attributes[attr] = element.getAttribute(attr) ?? "";
  }
  return attributes;
};

const toSelector = (element: Element): string => {
  const parts: string[] = [];
  let node: Element | null = element;
  while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
    let selector = node.nodeName.toLowerCase() ?? "";
    if (node.id) {
      selector += "#" + cssEscape(node.id);
      parts.unshift(selector);
      break;
    }

    if (node.classList?.length) {
      selector +=
        "." +
        Array.from(node.classList)
          .map((cls) => cssEscape(cls))
          .join(".");
    }

    const parent = node.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName === node.tagName,
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(node) + 1;
        selector += ":nth-of-type(" + index + ")";
      }
    }

    parts.unshift(selector);
    node = parent;
  }

  return parts.join(" > ");
};

const describeElement = (
  element: Element | null,
): AutomationElementDescriptor | null => {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;

  const rect = element.getBoundingClientRect();
  const visible = rect.width > 0 && rect.height > 0;
  const handle = handles.register(element);
  const textValue =
    "value" in element &&
    typeof (element as HTMLInputElement).value === "string"
      ? (element as HTMLInputElement).value
      : (element.textContent ?? "");

  return {
    handle,
    tag: element.tagName?.toLowerCase?.() ?? "",
    text: textValue?.slice(0, 500) ?? "",
    name: element.getAttribute("aria-label") ?? undefined,
    role: element.getAttribute("role") ?? undefined,
    attributes: describeAttributes(element),
    actions: computeActions(element),
    boundingBox: {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    },
    selector: toSelector(element),
    visible,
  };
};

const waitForSelector = (selector: string, timeout?: number) =>
  new Promise<boolean>((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(true);
      return;
    }

    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error("ERR_TIMEOUT"));
    }, timeout ?? 5000);

    const observer = new MutationObserver(() => {
      const node = document.querySelector(selector);
      if (node) {
        clearTimeout(timer);
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

const scrollElementIntoView = (element: Element) => {
  if (typeof (element as HTMLElement).scrollIntoView === "function") {
    (element as HTMLElement).scrollIntoView({
      block: "center",
      behavior: "instant",
    });
  }
};

const dispatchMouseEvent = (
  element: Element,
  type: string,
  init: MouseEventInit,
) => {
  element.dispatchEvent(new MouseEvent(type, init));
};

export const automation = {
  async query(payload?: BrowserQueryArgs): Promise<BrowserQueryResult> {
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

    const runQuery = (): BrowserQueryResult => {
      if (dumpTree) {
        const tree: Array<AutomationElementDescriptor | null> = [];
        const walker = document.createTreeWalker(
          document.body ?? document.documentElement,
          NodeFilter.SHOW_ELEMENT,
        );
        let current: Node | null = walker.currentNode;
        while (current && tree.length < maxResults) {
          tree.push(describeElement(current as Element));
          current = walker.nextNode();
        }
        return tree.filter(Boolean) as AutomationElementDescriptor[];
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
        .filter(Boolean) as AutomationElementDescriptor[];
    };

    if (timeout) {
      return Promise.race([
        new Promise<BrowserQueryResult>((_, reject) =>
          setTimeout(() => reject(new Error("ERR_TIMEOUT")), timeout),
        ),
        Promise.resolve(runQuery()),
      ]);
    }

    return runQuery();
  },

  describe(payload: { handle: string }) {
    return describeElement(handles.resolve(payload.handle));
  },

  click(payload: BrowserClickArgs) {
    const { handle, button = "left", clicks = 1, offset } = payload ?? {};
    const element = handles.resolve(handle);

    if (typeof (element as HTMLElement).focus === "function") {
      (element as HTMLElement).focus();
    }
    scrollElementIntoView(element);

    if (
      button === "left" &&
      !offset &&
      typeof (element as HTMLElement).click === "function"
    ) {
      for (let i = 0; i < clicks; i++) {
        (element as HTMLElement).click();
      }
    } else {
      const rect = element.getBoundingClientRect();
      const clientX = rect.left + (offset?.x ?? rect.width / 2);
      const clientY = rect.top + (offset?.y ?? rect.height / 2);

      const init: MouseEventInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY,
        button: button === "left" ? 0 : button === "middle" ? 1 : 2,
        detail: clicks,
      };

      element.dispatchEvent(new MouseEvent("mousedown", init));
      element.dispatchEvent(new MouseEvent("mouseup", init));
      element.dispatchEvent(new MouseEvent("click", init));
    }

    return describeElement(element);
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

    return describeElement(element);
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
    return true;
  },

  scroll(payload?: BrowserScrollArgs) {
    const { handle, x, y, direction, smooth } = payload ?? {};
    const target = handle ? handles.resolve(handle) : null;
    const behavior: ScrollBehavior = smooth ? "smooth" : "auto";

    const scrollX =
      x ?? (direction === "left" ? -200 : direction === "right" ? 200 : 0);
    const scrollY =
      y ?? (direction === "up" ? -200 : direction === "down" ? 200 : 0);

    if (target && typeof (target as HTMLElement).scrollBy === "function") {
      (target as HTMLElement).scrollBy({
        left: scrollX,
        top: scrollY,
        behavior,
      });
    } else {
      window.scrollBy({ left: scrollX, top: scrollY, behavior });
    }

    return true;
  },

  async waitFor(payload?: BrowserWaitArgs): Promise<boolean> {
    const { state, selector, timeout = 5000 } = payload ?? {};

    if (state === "domcontentloaded") {
      if (document.readyState !== "loading") return true;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("ERR_TIMEOUT")),
          timeout,
        );
        document.addEventListener(
          "DOMContentLoaded",
          () => {
            clearTimeout(timer);
            resolve(true);
          },
          { once: true },
        );
      });
      return true;
    }

    if (selector) {
      await waitForSelector(selector, timeout);
      return true;
    }

    if (state === "networkidle") {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return true;
    }

    return true;
  },

  hover(payload: BrowserHoverArgs) {
    const { handle, offset } = payload ?? {};
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

    return describeElement(element);
  },

  focus(payload: BrowserFocusArgs) {
    const { handle, scroll = true } = payload ?? {};
    const element = handles.resolve(handle);

    if (scroll) {
      scrollElementIntoView(element);
    }

    if (typeof (element as HTMLElement).focus === "function") {
      (element as HTMLElement).focus();
    }

    return describeElement(element);
  },
};

window.addEventListener("beforeunload", () => handles.clear());

export default automation;
