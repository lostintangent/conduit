// Monaco worker setup - MUST be imported before any other monaco imports
// Based on official Monaco Editor Vite React sample

// Import workers with Vite's ?worker suffix
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

// Set up MonacoEnvironment before importing monaco
(self as any).MonacoEnvironment = {
  getWorker(_: any, label: string) {
    if (label === "json") {
      return new jsonWorker();
    }
    if (label === "css" || label === "scss" || label === "less") {
      return new cssWorker();
    }
    if (label === "html" || label === "handlebars" || label === "razor") {
      return new htmlWorker();
    }
    if (label === "typescript" || label === "javascript") {
      return new tsWorker();
    }

    return new editorWorker();
  },
};

console.log("[Monaco Workers] MonacoEnvironment configured");

// Import from 'monaco-editor' (full bundle) NOT 'monaco-editor/esm/vs/editor/editor.api'
// The full bundle automatically includes all language contributions
import * as monaco from "monaco-editor";

// Import Shiki for rich TextMate-based syntax highlighting
import { shikiToMonaco } from "@shikijs/monaco";
import { createHighlighter } from "shiki";

// Import VS Code's official markdown grammar for proper bold/italic support
import markdownGrammar from "./markdown-vscode.tmLanguage.json";

// Import tsconfig loading logic
import { loadTsConfigOptions } from "./tsconfigLoader";

/**
 * Configures Monaco's TypeScript language service with tsconfig from the user's project
 * Should be called when opening a new project/cwd
 */
export async function configureTsConfig(cwd: string, api: any): Promise<void> {
  // Create Monaco TypeScript API object for the loader
  const monacoApi = {
    ScriptTarget: monaco.languages.typescript.ScriptTarget,
    ModuleKind: monaco.languages.typescript.ModuleKind,
    ModuleResolutionKind: monaco.languages.typescript.ModuleResolutionKind,
    JsxEmit: monaco.languages.typescript.JsxEmit,
  };

  const compilerOptions = await loadTsConfigOptions(cwd, api, monacoApi);

  // Apply to both TypeScript and JavaScript
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions(
    compilerOptions,
  );
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions(
    compilerOptions,
  );

  // Enable eager model sync for better cross-file IntelliSense
  monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
  monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true);
}

console.log(
  "[Monaco Workers] Full monaco-editor bundle loaded with all languages",
);

// Configure markdown language to support wrapping selections with markdown syntax
monaco.languages.setLanguageConfiguration("markdown", {
  surroundingPairs: [
    { open: "*", close: "*" }, // Italic: *text*
    { open: "_", close: "_" }, // Italic: _text_
    { open: "**", close: "**" }, // Bold: **text**
    { open: "__", close: "__" }, // Bold: __text__
    { open: "[", close: "]" }, // Link text: [text]
    { open: "(", close: ")" }, // Link URL: (url)
    { open: "`", close: "`" }, // Inline code: `code`
    { open: "```", close: "```" }, // Code block: ```code```
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

console.log("[Monaco] Markdown language configuration enhanced");

// Initialize Shiki for VS Code-quality syntax highlighting
// Shiki will provide "dark-plus" and "light-plus" themes with proper markdown support
async function initializeShiki() {
  console.log("[Monaco Shiki] Initializing TextMate grammars...");

  try {
    // Create Shiki highlighter with themes and languages
    // Only include languages that are confirmed to exist in Shiki's bundle
    const highlighter = await createHighlighter({
      themes: [
        // VS Code default themes (for compatibility)
        "dark-plus",
        "light-plus",
      ],
      langs: [
        // Core web languages
        "typescript",
        "javascript",
        "tsx",
        "jsx",
        "css",
        "scss",
        "less",
        "html",
        "json",
        "jsonc",

        // Use VS Code's official markdown grammar for proper bold/italic tokenization
        // @ts-expect-error - Custom grammar object from VS Code's markdown.tmLanguage.json
        {
          name: "markdown",
          scopeName: "text.html.markdown",
          ...markdownGrammar,
          aliases: ["md"],
        },

        "yaml",
        "xml",

        // Shell scripts
        "shell",
        "bash",
        "powershell",

        // Programming languages
        "python",
        "rust",
        "go",
        "java",
        "c",
        "cpp",
        "csharp",
        "php",
        "ruby",

        // Config/data formats
        "dockerfile",
        "sql",
        "graphql",
        "toml",
        "ini",
        "diff",
        "makefile",
      ],
    });

    // Wire Shiki to Monaco for rich syntax highlighting
    // This automatically registers all loaded themes with Monaco
    shikiToMonaco(highlighter, monaco);

    console.log("[Monaco Shiki] TextMate grammars loaded successfully!");

    // Export highlighter for potential use elsewhere
    (window as any).shikiHighlighter = highlighter;
  } catch (error) {
    console.error("[Monaco Shiki] Failed to initialize:", error);
    console.warn(
      "[Monaco Shiki] Falling back to Monaco built-in syntax highlighting",
    );
  }
}

// Initialize Shiki (async, non-blocking)
initializeShiki();
