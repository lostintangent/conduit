/**
 * Monaco Editor Setup - Global configuration for Monaco.
 *
 * This module configures Monaco with language settings and other global options.
 * It should be imported once at editor initialization.
 *
 * Configurations:
 * - Markdown language: surrounding pairs and auto-closing for markdown syntax
 * - Zig language: registration for .zig and .zon files
 * - TypeScript/JavaScript: diagnostics disabled (custom URI schemes not supported)
 */

import * as monaco from "monaco-editor";

let isConfigured = false;

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
