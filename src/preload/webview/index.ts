import automationSource from "./automation.ts?raw";

// Inject the automation script into the webview page's main world
(() => {
  let injected = false;

  const inject = () => {
    if (injected) return;

    const target =
      document.documentElement || document.head || document.body || null;
    if (!target) {
      // DOM not ready yet; wait for it below.
      return;
    }

    try {
      const script = document.createElement("script");
      script.textContent = `${automationSource}\n//# sourceURL=conduit-automation.js`;
      target.appendChild(script);
      script.remove();
      injected = true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to inject Conduit automation", error);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject, { once: true });
  } else {
    inject();
  }
})();
