import type { WebviewTag } from "electron";

export type SelectorArgs = {
  selector: string;
  nth?: number;
};

export type WaitOptions = SelectorArgs & {
  state?: "attached" | "visible";
  timeoutMs?: number;
};

export type ScrollOptions = {
  x?: number;
  y?: number;
  selector?: string;
  intoView?: boolean;
};

export type QueryResult = {
  selector: string;
  tag: string;
  id?: string;
  classes: string[];
  innerText?: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type AutomationResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string; details?: unknown };

const DEFAULT_TIMEOUT = 5000;

async function runInWebview<T>(
  webview: WebviewTag,
  script: (args: any) => Promise<T> | T,
  args: any,
): Promise<T> {
  const serializedArgs = JSON.stringify(args ?? {});
  const scriptText = `(() => { const args = ${serializedArgs}; return (${script.toString()})(args); })();`;
  return webview.executeJavaScript(scriptText, true);
}

export async function waitForSelector(
  webview: WebviewTag,
  options: WaitOptions,
): Promise<AutomationResult<{ count: number }>> {
  const waitScript = async (
    waitArgs: WaitOptions & { timeoutMs: number },
  ): Promise<AutomationResult<{ count: number }>> => {
    const { selector, nth = 0, state = "visible", timeoutMs } = waitArgs;
    const start = performance.now();

    return new Promise((resolve) => {
      const check = () => {
        const matches = Array.from(document.querySelectorAll(selector));
        const target = matches[nth];
        if (target) {
          const rect = target.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;

          if (state === "attached" || (state === "visible" && isVisible)) {
            resolve({ success: true, data: { count: matches.length } });
            return;
          }
        }

        if (performance.now() - start > timeoutMs) {
          resolve({
            success: false,
            error: `Timed out waiting for selector: ${selector}`,
            details: { count: matches.length },
          });
          return;
        }

        setTimeout(check, 200);
      };

      check();
    });
  };

  return runInWebview(webview, waitScript, {
    ...options,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT,
  });
}

export async function clickElement(
  webview: WebviewTag,
  options: WaitOptions,
): Promise<AutomationResult<{ count: number }>> {
  const clickScript = async (
    clickArgs: WaitOptions & { timeoutMs: number },
  ): Promise<AutomationResult<{ count: number }>> => {
    const { selector, nth = 0, state = "visible", timeoutMs } = clickArgs;
    const start = performance.now();

    const attemptClick = (): Promise<AutomationResult<{ count: number }>> => {
      return new Promise((resolve) => {
        const matches = Array.from(document.querySelectorAll(selector));
        const target = matches[nth];

        if (target) {
          const rect = target.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;

          if (state === "attached" || (state === "visible" && isVisible)) {
            target.scrollIntoView({ block: "center", inline: "center" });

            const { left, top, width, height } = target.getBoundingClientRect();
            const clientX = left + width / 2;
            const clientY = top + height / 2;

            const eventInit: MouseEventInit = {
              bubbles: true,
              cancelable: true,
              composed: true,
              clientX,
              clientY,
            };

            const mouseEvents: (keyof GlobalEventHandlersEventMap)[] = [
              "pointerover",
              "pointerenter",
              "mouseover",
              "mouseenter",
              "pointerdown",
              "mousedown",
              "pointerup",
              "mouseup",
              "click",
            ];

            for (const type of mouseEvents) {
              target.dispatchEvent(new MouseEvent(type, eventInit));
            }

            resolve({ success: true, data: { count: matches.length } });
            return;
          }
        }

        if (performance.now() - start > timeoutMs) {
          resolve({
            success: false,
            error: `Timed out waiting to click selector: ${selector}`,
            details: { count: matches.length },
          });
          return;
        }

        setTimeout(() => resolve(attemptClick()), 200);
      });
    };

    return attemptClick();
  };

  return runInWebview(webview, clickScript, {
    ...options,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT,
  });
}

export async function typeIntoElement(
  webview: WebviewTag,
  options: WaitOptions & {
    text: string;
    clear?: boolean;
    enterKey?: boolean;
  },
): Promise<AutomationResult<{ count: number }>> {
  const typeScript = async (
    typeArgs: WaitOptions & {
      text: string;
      clear?: boolean;
      enterKey?: boolean;
      timeoutMs: number;
    },
  ): Promise<AutomationResult<{ count: number }>> => {
    const {
      selector,
      nth = 0,
      state = "visible",
      timeoutMs,
      text,
      clear,
      enterKey,
    } = typeArgs;
    const start = performance.now();

    const attemptType = (): Promise<AutomationResult<{ count: number }>> => {
      return new Promise((resolve) => {
        const matches = Array.from(document.querySelectorAll(selector));
        const target = matches[nth] as
          | HTMLInputElement
          | HTMLTextAreaElement
          | null;

        if (target) {
          const rect = target.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;

          if (state === "attached" || (state === "visible" && isVisible)) {
            target.focus();

            if (clear) {
              target.value = "";
              target.dispatchEvent(new InputEvent("input", { bubbles: true }));
            }

            target.value = text;
            target.dispatchEvent(new InputEvent("input", { bubbles: true }));
            target.dispatchEvent(new Event("change", { bubbles: true }));

            if (enterKey) {
              const eventInit: KeyboardEventInit = {
                key: "Enter",
                code: "Enter",
                bubbles: true,
              };

              target.dispatchEvent(new KeyboardEvent("keydown", eventInit));
              target.dispatchEvent(new KeyboardEvent("keypress", eventInit));
              target.dispatchEvent(new KeyboardEvent("keyup", eventInit));
            }

            resolve({ success: true, data: { count: matches.length } });
            return;
          }
        }

        if (performance.now() - start > timeoutMs) {
          resolve({
            success: false,
            error: `Timed out waiting to type into selector: ${selector}`,
            details: { count: matches.length },
          });
          return;
        }

        setTimeout(() => resolve(attemptType()), 200);
      });
    };

    return attemptType();
  };

  return runInWebview(webview, typeScript, {
    ...options,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT,
  });
}

export async function scrollPage(
  webview: WebviewTag,
  options: ScrollOptions,
): Promise<AutomationResult<void>> {
  const scrollScript = async (
    scrollArgs: ScrollOptions,
  ): Promise<AutomationResult<void>> => {
    const { selector, intoView, x, y } = scrollArgs;

    if (selector) {
      const target = document.querySelector(selector);
      if (!target) {
        return {
          success: false,
          error: `Selector not found for scrolling: ${selector}`,
        };
      }

      if (intoView) {
        target.scrollIntoView({ block: "center", inline: "center" });
      } else {
        target.scrollIntoView({});
      }

      return { success: true };
    }

    if (typeof x === "number" || typeof y === "number") {
      window.scrollBy({
        left: x ?? 0,
        top: y ?? 0,
        behavior: "auto",
      });
      return { success: true };
    }

    return {
      success: false,
      error: "No scroll target provided. Specify selector or coordinates.",
    };
  };

  return runInWebview(webview, scrollScript, options);
}

export async function evaluateScript(
  webview: WebviewTag,
  paneScript: string,
): Promise<AutomationResult<unknown>> {
  const evalScript = async (
    code: string,
  ): Promise<AutomationResult<unknown>> => {
    try {
      const executor = new Function(
        "args",
        `return (async () => { ${code} })();`,
      );
      const result = await executor({});
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: `Evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  };

  return webview.executeJavaScript(
    `(${evalScript.toString()})(${JSON.stringify(paneScript)})`,
    true,
  );
}

export async function queryElements(
  webview: WebviewTag,
  selector: string,
): Promise<AutomationResult<QueryResult[]>> {
  const queryScript = async (
    querySelector: string,
  ): Promise<AutomationResult<QueryResult[]>> => {
    const matches = Array.from(document.querySelectorAll(querySelector));

    const mapped = matches.slice(0, 20).map((element, index) => {
      const rect = element.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0;

      return {
        selector: `${querySelector} [${index}]`,
        tag: element.tagName.toLowerCase(),
        id: (element as HTMLElement).id || undefined,
        classes: Array.from((element as HTMLElement).classList),
        innerText: (element as HTMLElement).innerText?.slice(0, 500),
        boundingBox: isVisible
          ? {
              x: rect.x + window.scrollX,
              y: rect.y + window.scrollY,
              width: rect.width,
              height: rect.height,
            }
          : undefined,
      } satisfies QueryResult;
    });

    return { success: true, data: mapped };
  };

  return webview.executeJavaScript(
    `(${queryScript.toString()})(${JSON.stringify(selector)})`,
    true,
  );
}
