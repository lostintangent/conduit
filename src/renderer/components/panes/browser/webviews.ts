import type { WebviewTag } from "electron";

export type WebviewInstance = {
  webview: WebviewTag;
  initialized: boolean;
  markInitialized: () => void;
  dispose: () => void;
};

type GetOrCreateOptions = {
  initialUrl: string;
};

const store = new Map<string, WebviewInstance>();

export function getOrCreate(
  paneId: string,
  options: GetOrCreateOptions
): WebviewInstance {
  let instance = store.get(paneId);
  if (!instance) {
    const webview = document.createElement("webview");

    const newInstance: WebviewInstance = {
      webview,
      initialized: false,
      markInitialized: () => {
        newInstance.initialized = true;
      },
      dispose: () => {
        newInstance.initialized = false;
        webview.remove();
      },
    };

    store.set(paneId, newInstance);
    instance = newInstance;
  }

  if (!instance.initialized && options.initialUrl) {
    instance.webview.setAttribute("src", options.initialUrl);
  }

  return instance;
}

export function attach(paneId: string, container: HTMLElement) {
  const instance = store.get(paneId);
  if (!instance) {
    return;
  }

  const element = instance.webview;
  if (element.parentElement !== container) {
    container.appendChild(element);
  }
}

export function disposeWebview(paneId: string) {
  const instance = store.get(paneId);
  if (!instance) {
    return;
  }

  instance.dispose();
  store.delete(paneId);
}
