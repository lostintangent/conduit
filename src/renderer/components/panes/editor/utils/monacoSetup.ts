/**
 * Monaco Editor Setup - Global configuration for Monaco.
 *
 * This module configures Monaco with language settings and other global options.
 * It should be imported once at editor initialization.
 *
 * Configurations:
 * - Monaco Environment: worker configuration (prevents console errors)
 * - Markdown: *, _, backticks, brackets and quotes wrap the selection
 * - Zig, TOML, Makefile and diff: Monarch tokenizers Monaco doesn't ship
 * - JSONC: .jsonc files open as JSON with comments and trailing commas allowed
 * - TypeScript/JavaScript: diagnostics disabled (custom URI schemes not supported)
 * - Keybindings: app shortcuts Monaco would take (Cmd+Option+Up/Down, Cmd+E,
 *   Cmd+Option+W, Ctrl+Shift+Cmd+Left/Right) reach the app, and the app's
 *   Cmd+K chords run from editors too
 */

import * as monaco from "monaco-editor";
import { bridgeAppChords } from "./monacoChordBridge";
import { MONARCH_LANGUAGES } from "./monarchLanguages";

let isConfigured = false;

// Workers are prebuilt next to index.html by build/bun.build.ts.
const createWorker = (name: string) =>
  new Worker(new URL(`monaco/${name}.worker.js`, document.baseURI), {
    type: "module",
  });

// Configure Monaco Environment for web workers
// This must be set before any Monaco editor instances are created
// Without this, Monaco logs: "You must define a function MonacoEnvironment.getWorkerUrl or MonacoEnvironment.getWorker"
(
  self as unknown as { MonacoEnvironment?: monaco.Environment }
).MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    // Provide the appropriate worker based on language
    if (label === "json") {
      return createWorker("json");
    }
    // TypeScript and JavaScript use the TypeScript worker
    if (label === "typescript" || label === "javascript") {
      return createWorker("ts");
    }
    // All other languages use the basic editor worker
    return createWorker("editor");
  },
};

/**
 * Configure Monaco editor with global settings.
 * Safe to call multiple times - only runs once.
 * Silently skips if Monaco is not available (e.g., in test environment).
 */
export function configureMonaco(): void {
  if (isConfigured) {
    return;
  }

  // Skip if Monaco is not fully loaded (e.g., in test environment)
  if (!monaco?.languages?.register) {
    return;
  }

  isConfigured = true;

  for (const { id, tokenizer, configuration } of MONARCH_LANGUAGES) {
    monaco.languages.register({ id });
    monaco.languages.setMonarchTokensProvider(id, tokenizer);
    if (configuration) {
      monaco.languages.setLanguageConfiguration(id, configuration);
    }
  }

  // detectLanguage opens .jsonc as json, whose validator flags comments and
  // trailing commas as errors unless the file's schema allows them.
  const { jsonDefaults } = monaco.json;
  jsonDefaults.setDiagnosticsOptions({
    ...jsonDefaults.diagnosticsOptions,
    schemas: [
      ...(jsonDefaults.diagnosticsOptions.schemas ?? []),
      {
        uri: "conduit://schemas/jsonc",
        fileMatch: ["*.jsonc"],
        schema: { allowComments: true, allowTrailingCommas: true },
      },
    ],
  });

  // Monaco applies its own Markdown configuration when the first Markdown
  // model loads the grammar module, and the later registration wins. So wait
  // for that module, then add ours in the next task, once Monaco's is in.
  const markdown = monaco.languages
    .getLanguages()
    .find(({ id }) => id === "markdown") as
    | (monaco.languages.ILanguageExtensionPoint & {
        loader?: () => Promise<unknown>;
      })
    | undefined;
  monaco.languages.onLanguageEncountered("markdown", async () => {
    await markdown?.loader?.();
    setTimeout(() => {
      // Typing one of these wraps the selection. Typing * or _ twice makes it bold.
      monaco.languages.setLanguageConfiguration("markdown", {
        surroundingPairs: [
          { open: "*", close: "*" },
          { open: "_", close: "_" },
          { open: "`", close: "`" },
          { open: "[", close: "]" },
          { open: "(", close: ")" },
          { open: '"', close: '"' },
          { open: "'", close: "'" },
        ],
      });
    });
  });

  // App shortcuts that Monaco would otherwise take while an editor has focus.
  // Removing Monaco's binding lets the key reach the app.
  const { KeyMod, KeyCode } = monaco;
  monaco.editor.addKeybindingRules([
    // Cmd+Option+Arrow navigates panes. Monaco only binds Up and Down (to add
    // a cursor).
    {
      keybinding: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.UpArrow,
      command: "-editor.action.insertCursorAbove",
    },
    {
      keybinding: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.DownArrow,
      command: "-editor.action.insertCursorBelow",
    },
    // Cmd+E toggles the sidebar. Cmd+F already seeds find from the selection.
    {
      keybinding: KeyMod.CtrlCmd | KeyCode.KeyE,
      command: "-actions.findWithSelection",
    },
    // Cmd+Option+W duplicates a tab into a worktree. Monaco toggles whole-word
    // find with it even when the find widget is closed, so keep that only
    // while the widget has focus.
    {
      keybinding: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyW,
      command: "-toggleFindWholeWord",
    },
    {
      keybinding: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyW,
      command: "toggleFindWholeWord",
      when: "findWidgetFocused",
    },
    // Ctrl+Shift+Cmd+Arrow splits an agent session pane. Monaco's other
    // binding, Ctrl+Shift+Left/Right, still shrinks and expands the selection.
    {
      keybinding:
        KeyMod.WinCtrl | KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.LeftArrow,
      command: "-editor.action.smartSelect.shrink",
    },
    {
      keybinding:
        KeyMod.WinCtrl | KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.RightArrow,
      command: "-editor.action.smartSelect.expand",
    },
  ]);

  // Cmd+K starts Monaco's own chords, so the app's Cmd+K chords need bridging
  bridgeAppChords();

  // Disable TypeScript/JavaScript diagnostics globally
  // Monaco's TS language service can't resolve imports with custom URI schemes
  monaco.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
    noSuggestionDiagnostics: true,
  });
  monaco.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
    noSuggestionDiagnostics: true,
  });
}
