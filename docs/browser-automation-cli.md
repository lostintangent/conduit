# Browser Automation via Conduit CLI

## Goals

- Allow AI agents to fully drive browser panes from the Conduit CLI (open URL, inspect, click, type, scroll, evaluate JS, capture output).
- Keep automation self-contained inside Conduit (no reliance on the Chrome extension for control paths).
- Provide deterministic, scriptable primitives that map cleanly to IPC and are easy to sandbox.
- Make targeting elements reliable for agents (rich metadata, repeatable selectors, and structured responses).

## Current State

- CLI supports `navigate-browser` (loads a URL in a given webview pane) and `capture-browser` (delegates screenshotting to the main process).
- CLI commands are defined in `src/cli/index.ts` and routed through the main process IPC server to the renderer (`useCliClient`).
- Renderer locates the webview by pane ID and, for capture, passes the WebContents ID back to the main process for execution.
- No primitives exist for input events (click, type, scroll, keypress) or DOM querying.

## Design Overview

Introduce a **browser automation channel** that mirrors the existing CLI → main → renderer pipeline but specializes in webview control. The renderer will host an automation runtime per webview that can:

1. Execute JavaScript inside the webview to locate elements and drive events.
2. Return structured element descriptors to the CLI for agent reasoning.
3. Maintain lightweight session state (last focused element, frame scope, pending navigation) to make multi-step automation predictable.

### Why Not the Chrome Extension?

- Webviews already expose their `webContents` to the renderer/main process. Using `executeJavaScript` keeps control paths in-app and works offline.
- The extension would complicate distribution, permissions, and update flows. It can remain optional for page-level augmentation but is not required for automation.

### Automation Runtime

- Inject a preload script into automation-enabled webviews that exposes a limited `window.__conduitAutomation` bridge. The bridge provides:
  - `query(selectors, options)` → list of nodes with stable handles (internal IDs), bounding boxes, accessible names/roles, text snippets, attributes, and computed CSS selectors.
  - `act(handle, action)` → dispatches synthesized events (click, scroll, type text, key presses, set value) against a previously returned handle.
  - `evaluate(expression, context)` → runs scoped JS for advanced use cases (feature-gated).
- Handles are tracked in a Map inside the preload; they are invalidated on navigation and DOM mutations to avoid stale references.
- All invocations are serialized and validated in the preload to avoid arbitrary code execution and to ensure consistent results.

### CLI Surface

Add a cohesive set of commands (all routed through the existing IPC plumbing):

- `browser-query <paneId> <selector>`: returns structured matches. Options: `--context <handle>`, `--max-results`, `--text <contains>`, `--role <ariaRole>`, `--timeout`.
- `browser-click <paneId> <handle>`: click via stored handle; options for `--button`, `--clicks`, `--delay`, `--offset`.
- `browser-type <paneId> <handle> <text>`: focus + type text; options for `--submit`, `--delay`, `--replace`.
- `browser-keys <paneId> <keys...>`: send key chords to the active element.
- `browser-scroll <paneId> [handle]`: scroll target element or page; options for `--x`, `--y`, `--direction`, `--smooth`.
- `browser-wait <paneId>`: wait for load states (`domcontentloaded`, `networkidle`) or selector appearance.
- `browser-evaluate <paneId> <script>`: scoped evaluation through the preload (guarded by an allowlist of globals and optional feature flag).
- `browser-capture <paneId> [path]`: retain current capture command but allow optional crop to a handle or bounding box.

### Renderer Integration

- Extend `useCliClient` with new command cases that:
  - Resolve the target webview by `paneId` and fetch its `webContentsId`.
  - Forward automation requests to a new `automation` module that wraps `webContents.send` to the preload bridge (channel names like `automation:query`, `automation:act`).
  - Handle errors (missing webview, navigation in progress, invalid handles) and send structured responses back to the CLI.
- The automation module also subscribes to webview events (`did-navigate`, `dom-ready`) to reset handle state and to preload the bridge when the page is ready.

### Main Process Role

- Reuse the existing CLI IPC server; no new socket layer is needed.
- For operations requiring main-process privileges (full-page screenshot, file writes), provide helper methods invoked from the renderer once it has the WebContents ID.
- Optionally throttle or queue automation commands per pane to avoid racing navigations and input events.

### Targeting Strategy for Agents

- Return rich metadata from `browser-query` to help agents choose targets:
  - Accessible name/role, `id`/`name`/`aria-label`/`placeholder`, inner text excerpt, tag name, bounding box, visibility state, and a best-effort CSS selector.
  - Include an `actions` array (e.g., `clickable`, `typeable`, `navigates`) inferred from element semantics.
- Provide a `--dump-tree` mode that returns a compact accessibility tree snapshot for the top N nodes; this helps agents without running arbitrary queries first.
- Encourage agents to pass exact handles returned by `browser-query`; selectors are a convenience fallback.

### Safety and Robustness

- Enforce timeouts and navigation checks before dispatching actions.
- Sanitize text input and key lists; block privileged APIs inside `evaluate` by running inside the preload sandbox and removing dangerous globals.
- Keep automation opt-in per webview: enable the preload only for panes created via the CLI or when a user toggles “Allow automation” in the UI.
- Surface deterministic errors to the CLI (e.g., `ERR_NAVIGATING`, `ERR_HANDLE_STALE`) for easy agent retries.

### Incremental Delivery Plan

1. **Bridge + Preload**: Add automation preload for webviews and renderer helpers to send structured query/act commands.
2. **CLI Commands**: Implement `browser-query`, `browser-click`, `browser-type`, `browser-keys`, `browser-scroll`, `browser-wait`, and enhance `browser-capture`.
3. **Metadata & Diagnostics**: Add structured element responses, accessibility dump mode, and verbose logging flags for debugging.
4. **Hardening**: Timeouts, navigation guards, handle invalidation, and optional feature flag for `browser-evaluate`.
5. **Documentation**: Provide CLI examples tailored to agents (end-to-end flow: query → click → type → submit → capture).

## Summary

By adding an automation preload and a thin command layer in the renderer, Conduit can expose Playwright-like primitives over the existing CLI transport without depending on a Chrome extension. Agents gain the ability to query, click, type, scroll, and evaluate inside any browser pane using deterministic handles and structured responses, while Conduit keeps control paths local, secure, and debuggable.
