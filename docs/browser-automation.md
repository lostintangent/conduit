# Browser Automation via the Conduit CLI

This document proposes a design for giving AI agents full-page automation through the Conduit CLI, extending the existing browser-pane navigation and screenshot features.

## Goals

1. Allow agents to **open, inspect, and interact** with pages from the terminal-only CLI interface.
2. Keep the architecture consistent with the current CLI ↔ main ↔ renderer IPC flow so existing session semantics and permissions are reused.
3. Avoid introducing extra surfaces (e.g., a Chrome extension) unless they unlock capabilities not possible via the embedded Electron browser.
4. Provide targeting primitives (selectors, roles, visible text) that are reliable for agents without human context.
5. Remain safe-by-default: respect same-session isolation, prevent arbitrary host automation, and allow future policy enforcement.

## Current State

- CLI already exposes `browser open`/`browser screenshot` (or equivalent) commands that resolve to renderer handlers on the active browser pane.
- Renderer uses Electron `webContents` to load a URL and to capture images from the webview.
- There is no way to dispatch DOM events or retrieve DOM structure via the CLI.

## High-Level Approach

Use Electron's built-in automation APIs (no Chrome extension required) and expose a minimal action/inspection surface through new CLI commands. The renderer will execute actions by running JavaScript within the target `webContents` or by using the `webContents.debugger` protocol. This keeps everything in-process and consistent with the current IPC pipeline.

### Why no Chrome extension?

- Electron already provides the [Chromium DevTools Protocol](https://www.electronjs.org/docs/latest/api/web-contents#contentsdebugger) via `webContents.debugger` for input dispatching, DOM queries, and accessibility tree inspection.
- Executing JS in-page via `webContents.executeJavaScript` covers most actions (click, type, scroll) without installing an extension.
- An extension becomes useful only if we need persistent background scripts, cross-origin messaging outside Electron control, or page instrumentation that must survive reloads; these are not required for the baseline.

## Proposed CLI Surface

| Command                      | Arguments                                                | Behavior                                                                                     |
| ---------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `browser navigate`           | `url`                                                    | Load the URL in the active browser pane. Existing command; remains unchanged.                |
| `browser screenshot`         | `path`, `fullPage?`                                      | Capture PNG. Existing command.                                                               |
| `browser click`              | `selector`, `nth?`, `frame?`                             | Click the matching element. Fails with diagnostic if no match or multiple ambiguous matches. |
| `browser type`               | `selector`, `text`, `clear?`, `enterKey?`                | Focus element by selector, optionally clear, then insert text and optional Enter key.        |
| `browser scroll`             | `x?`, `y?`, `selector?`, `intoView?`                     | Scroll by coordinates or scroll element into view.                                           |
| `browser evaluate`           | `script`, `json?`                                        | Run arbitrary JS in the page sandbox; return JSON result for advanced agents.                |
| `browser wait`               | `selector`, `state?` (`attached`/`visible`) , `timeout?` | Wait for element conditions using repeated DOM queries.                                      |
| `browser query`              | `selector`, `attributes?`, `innerText?`                  | Return structured element metadata to help agents build plans.                               |
| `browser accessibility-tree` | `role?`, `name?`, `depth?`                               | Return pruned AX tree nodes for screen-reader-friendly targeting.                            |

### Selector Strategy

- Primary: **CSS selectors**; agents already tend to produce them reliably.
- Secondary: **text/role helpers**: provide helper syntax like `text="Submit"` or `role=button[name="Submit"]` that the renderer translates into DOM queries using `document.querySelector`, `querySelectorAll`, or `document.evaluate` for XPath.
- Disambiguation: allow `nth`/`index` parameter to pick among multiple matches; renderer surfaces all candidates (with bounding boxes and innerText) in error messages so the agent can refine.

## Renderer Implementation Details

### Target Resolution

- Each browser pane retains a `paneId`; the CLI requests already include `sessionId` to map to the correct renderer window.
- Renderer stores a map of `paneId -> webContents`. CLI commands include `paneId` (defaulting to the active one), so actions always address a specific page.

### Action Execution

- **executeJavaScript**: For simple actions (click, scroll into view, set `value`, dispatch `KeyboardEvent`), inject scripts that:
  - Resolve the selector (or helper predicate).
  - Verify element is interactable (connected, visible via `getBoundingClientRect`, not `disabled`).
  - Scroll into view, then synthesize events (`pointerdown/up/click`, `input`, `change`).
- **DevTools Protocol (CDP)** via `webContents.debugger` for higher fidelity:
  - `Input.dispatchMouseEvent` and `Input.dispatchKeyEvent` for accurate coordinates and key presses.
  - `DOM.getBoxModel`/`DOM.resolveNode` for retrieving bounding boxes when selector resolution is done in-page.
  - CDP is gated behind a per-pane debugger session; created lazily on first advanced call.
- Errors bubble back with structured diagnostics: selector used, number of matches, and the first few text snippets and attributes of matching nodes.

### Query/Inspection

- `browser query` runs in-page JS to return an array of nodes with `{ selector, tag, id, classes, role, name, innerText, boundingBox }`, truncated for size.
- `browser accessibility-tree` uses `accessibility.getSnapshot` over CDP to return a limited-depth tree; useful for agents aligning to ARIA roles.
- Responses should be JSON so agents can parse deterministically.

### Waiting and Timeouts

- Implement a renderer utility `waitForElement(selector, state, timeout)` that polls on an interval (e.g., 200ms) with a timeout. State includes `attached`, `visible`, or `stable` (bounding box unchanged for N ms).
- Commands that rely on an element implicitly call `waitForElement` unless `--no-wait` is passed.

### Keyboard Text Input

- Prefer CDP `Input.insertText` for text entry to bypass IME/keyboard layout issues.
- For Enter/tab, use `Input.dispatchKeyEvent` with `key`/`code`.
- Provide `clear?` flag that sets `value = ""` before typing and dispatches `input`/`change`.

### Security and Isolation

- Reuse the existing CLI session gating: only terminals launched by Conduit have `CONDUIT_SOCKET_PATH`, so commands stay inside the app.
- Restrict automation to Conduit-managed panes; do not expose a generic CDP port.
- Add a main-process allowlist for commands if future policy needs to block automation on certain panes (e.g., system settings or auth surfaces).

## CLI and IPC Wiring

1. **CLI Definitions**: Extend `src/cli/index.ts` with new commands using the existing `cliCommand` helper. Arguments are serialized to the main process via the current JSON envelope.
2. **Main Process Server**: No protocol change; it forwards the new `command.name` values and payloads. Consider adding input size limits to avoid huge `evaluate` bodies.
3. **Renderer Hook**: `useCliClient` registers handlers for new command names and calls the browser automation service (new module under `src/renderer/browser/automation.ts`). That module abstracts selector resolution, CDP sessions, and error formatting.
4. **Type Safety**: Update shared `CliCommand` typings (`src/types/cli.ts` or equivalent) so commands are discoverable by the agent toolchain.

## Agent Experience and Ergonomics

- **Deterministic errors**: When a selector fails, return `{ error: "not-found", selector, candidates: [...] }` so the agent can iterate.
- **Page state hints**: Provide `browser query --near "Submit" --window 5` to return neighboring nodes around matching text, aiding spatial reasoning.
- **Optional DOM snapshot**: A `browser snapshot` command could return a pruned DOM or accessibility snapshot for offline reasoning without screenshots.
- **Rate limiting**: Add minimal debounce between high-frequency commands to avoid flooding the renderer; agents can still stream sequences but will receive backpressure.

## Migration / Rollout Plan

1. Implement the renderer automation service using `executeJavaScript` first; add CDP-backed paths for precision input once stable.
2. Add the new CLI commands behind a feature flag (e.g., `CONDUIT_BROWSER_AUTOMATION=1`) to iterate safely.
3. Ship a dogfood build; gather logs on selectors and failure reasons to refine error messages.
4. Document the API surface (this file and `docs/cli.md` references) so agents can rely on it.

## Alternatives Considered

- **Chrome Extension**: Offers persistent content scripts and cross-origin messaging but adds installation complexity and is redundant with Electron/CDP for this use case.
- **External Playwright Driver**: Running a separate Playwright instance would duplicate resources and complicate pane focus/state sharing; staying within the Conduit renderer keeps UI and automation aligned.
- **Expose Raw CDP Port**: Gives maximal power but increases attack surface and bypasses Conduit's session model. Prefer in-process CDP calls via renderer to maintain control.

## Open Questions

- Do we need recorded user gestures for auditing? If yes, log action summaries per session.
- Should long-running waits stream progress to the CLI? Could be useful for agents to adapt without timing out.
- How much of the automation API should be surfaced as a declarative script ("playback list of steps") versus single commands? Initial proposal focuses on single-step commands for simplicity.
