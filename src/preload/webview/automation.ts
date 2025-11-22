// @ts-check

/**
 * @typedef {import("@shared/cli/browser").AutomationElementDescriptor} AutomationElementDescriptor
 * @typedef {import("@shared/cli/browser").BrowserClickArgs} BrowserClickArgs
 * @typedef {import("@shared/cli/browser").BrowserKeysArgs} BrowserKeysArgs
 * @typedef {import("@shared/cli/browser").BrowserQueryArgs} BrowserQueryArgs
 * @typedef {import("@shared/cli/browser").BrowserQueryResult} BrowserQueryResult
 * @typedef {import("@shared/cli/browser").BrowserScrollArgs} BrowserScrollArgs
 * @typedef {import("@shared/cli/browser").BrowserTypeArgs} BrowserTypeArgs
 * @typedef {import("@shared/cli/browser").BrowserWaitArgs} BrowserWaitArgs
 */

const handles = new Map();
let sequence = 0;

const cssEscape = (str) => {
  if (typeof CSS !== "undefined" && CSS.escape) {
    return CSS.escape(str);
  }
  return str.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^{`{|}~]/g, "\\$&");
};

const computeActions = (element) => {
  const actions = [];
  const tag = element.tagName?.toLowerCase();
  const type = element.getAttribute("type") ?? undefined;

  if (typeof element.click === "function") {
    actions.push("clickable");
  }

  if (tag === "input" || tag === "textarea" || element.isContentEditable) {
    actions.push("typeable");
  }

  if (tag === "a" || type === "submit" || type === "button") {
    actions.push("navigates");
  }

  return actions;
};

const describeAttributes = (element) => {
  /** @type {Record<string, string>} */
  const attributes = {};
  for (const attr of element.getAttributeNames()) {
    attributes[attr] = element.getAttribute(attr) ?? "";
  }
  return attributes;
};

const toSelector = (element) => {
  const parts = [];
  let node = element;
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

const registerHandle = (element) => {
  const handle = "h-" + Date.now() + "-" + ++sequence;
  handles.set(handle, element);
  return handle;
};

/** @param {Element | null} element */
const describeElement = (element) => {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;

  const rect = element.getBoundingClientRect();
  const visible = rect.width > 0 && rect.height > 0;
  const handle = registerHandle(element);
  const textValue =
    "value" in element && typeof element.value === "string"
      ? element.value
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

const resolveHandle = (handle) => {
  const element = handles.get(handle);
  if (!element) throw new Error("ERR_HANDLE_STALE");
  return element;
};

const waitForSelector = (selector, timeout) =>
  new Promise((resolve, reject) => {
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

const automation = {
  /** @param {BrowserQueryArgs=} payload */
  async query(payload) {
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
      ? resolveHandle(contextHandle)
      : document.documentElement;

    /** @returns {BrowserQueryResult} */
    const runQuery = () => {
      if (dumpTree) {
        const tree = [];
        const walker = document.createTreeWalker(
          document.body ?? document.documentElement,
          NodeFilter.SHOW_ELEMENT,
        );
        let current = walker.currentNode;
        while (current && tree.length < maxResults) {
          tree.push(describeElement(current));
          current = walker.nextNode();
        }
        return tree.filter(Boolean);
      }

      const matches = Array.from(root.querySelectorAll(selector)).filter(
        (node) => {
          if (role && node.getAttribute("role") !== role) return false;
          if (text) {
            const content =
              (node.textContent ?? "") +
              ("value" in node && typeof node.value === "string"
                ? node.value
                : "");
            if (!content.toLowerCase().includes(text.toLowerCase())) {
              return false;
            }
          }
          return true;
        },
      );

      return matches.slice(0, maxResults).map((node) => describeElement(node));
    };

    if (timeout) {
      return Promise.race([
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("ERR_TIMEOUT")), timeout),
        ),
        Promise.resolve(runQuery()),
      ]);
    }

    return runQuery();
  },

  /** @param {{ handle: string }} payload */
  describe(payload) {
    return describeElement(resolveHandle(payload.handle));
  },

  /** @param {BrowserClickArgs} payload */
  click(payload) {
    const { handle, button = "left", clicks = 1, offset } = payload ?? {};
    const element = resolveHandle(handle);

    if (typeof element.focus === "function") element.focus();
    element.scrollIntoView({ block: "center", behavior: "instant" });

    if (button === "left" && !offset && typeof element.click === "function") {
      for (let i = 0; i < clicks; i++) {
        element.click();
      }
    } else {
      const rect = element.getBoundingClientRect();
      const clientX = rect.left + (offset?.x ?? rect.width / 2);
      const clientY = rect.top + (offset?.y ?? rect.height / 2);

      const init = {
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

  /** @param {BrowserTypeArgs} payload */
  async type(payload) {
    const { handle, text = "", submit, delay = 0, replace } = payload ?? {};
    const element = resolveHandle(handle);

    if (typeof element.focus === "function") element.focus();

    const applyValue = (next) => {
      if ("value" in element) {
        element.value = next;
        element.dispatchEvent(
          new Event("input", { bubbles: true, cancelable: true }),
        );
      } else {
        element.textContent = next;
      }
    };

    const currentValue =
      "value" in element && typeof element.value === "string"
        ? element.value
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

  /** @param {BrowserKeysArgs} payload */
  keys(payload) {
    const active = document.activeElement ?? document.body;
    for (const key of payload.keys ?? []) {
      const down = new KeyboardEvent("keydown", { key, bubbles: true });
      const up = new KeyboardEvent("keyup", { key, bubbles: true });
      active.dispatchEvent(down);
      active.dispatchEvent(up);
    }
    return true;
  },

  /** @param {BrowserScrollArgs=} payload */
  scroll(payload) {
    const { handle, x, y, direction, smooth } = payload ?? {};
    const target = handle ? resolveHandle(handle) : null;
    const behavior = smooth ? "smooth" : "auto";

    const scrollX =
      x ?? (direction === "left" ? -200 : direction === "right" ? 200 : 0);
    const scrollY =
      y ?? (direction === "up" ? -200 : direction === "down" ? 200 : 0);

    if (target && typeof target.scrollBy === "function") {
      target.scrollBy({ left: scrollX, top: scrollY, behavior });
    } else {
      window.scrollBy({ left: scrollX, top: scrollY, behavior });
    }

    return true;
  },

  /** @param {BrowserWaitArgs=} payload */
  async waitFor(payload) {
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
};

// Expose on the page
// @ts-ignore
window.__conduitAutomation = automation;
window.addEventListener("beforeunload", () => handles.clear());
