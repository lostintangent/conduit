/**
 * Monaco Editor Setup - Global configuration for Monaco.
 *
 * This module configures Monaco with language settings and other global options.
 * It should be imported once at editor initialization.
 *
 * Configurations:
 * - Monaco Environment: worker configuration (prevents console errors)
 * - Markdown language: surrounding pairs and auto-closing for markdown syntax
 * - Zig language: registration for .zig and .zon files
 * - TypeScript/JavaScript/JSON: diagnostics disabled (custom URI schemes not supported)
 */

import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

let isConfigured = false;

// Configure Monaco Environment for web workers
// This must be set before any Monaco editor instances are created
// Without this, Monaco logs: "You must define a function MonacoEnvironment.getWorkerUrl or MonacoEnvironment.getWorker"
(
  self as unknown as { MonacoEnvironment?: monaco.Environment }
).MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    // Provide the appropriate worker based on language
    if (label === "json") {
      return new jsonWorker();
    }
    // TypeScript and JavaScript use the TypeScript worker
    if (label === "typescript" || label === "javascript") {
      return new tsWorker();
    }
    // All other languages use the basic editor worker
    return new editorWorker();
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

  // Register Zig language with Monaco
  monaco.languages.register({ id: "zig", extensions: [".zig", ".zon"] });

  // Configure markdown language for better editing experience
  monaco.languages.setLanguageConfiguration("markdown", {
    surroundingPairs: [
      { open: "*", close: "*" }, // Italic: *text*
      { open: "_", close: "_" }, // Italic: _text_
      { open: "**", close: "**" }, // Bold: **text**
      { open: "__", close: "__" }, // Bold: __text__
      { open: "[", close: "]" }, // Link text: [text]
      { open: "(", close: ")" }, // Link URL: (url)
      { open: "`", close: "`" }, // Inline code: `code`
      { open: "```", close: "```" }, // Code block
      { open: '"', close: '"' }, // Quotes
      { open: "'", close: "'" }, // Single quotes
    ],
    autoClosingPairs: [
      { open: "*", close: "*" },
      { open: "_", close: "_" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "`", close: "`" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: "```", close: "```" },
    ],
  });

  // Disable TypeScript/JavaScript diagnostics globally
  // Monaco's TS language service can't resolve imports with custom URI schemes
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
    noSuggestionDiagnostics: true,
  });
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
    noSuggestionDiagnostics: true,
  });
}
