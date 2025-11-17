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

/**
 * Loads and parses tsconfig.json from the project root
 * Returns Monaco-compatible compiler options
 */
async function loadTsConfigOptions(): Promise<monaco.languages.typescript.CompilerOptions> {
  console.log("[Monaco TypeScript] Loading tsconfig.json...");

  try {
    // Try to import tsconfig.json from project root (two levels up from src/renderer)
    // @ts-ignore - dynamic import of JSON
    const tsconfig = await import("../../tsconfig.json");
    const opts: any =
      tsconfig.default?.compilerOptions || tsconfig.compilerOptions || {};

    console.log("[Monaco TypeScript] Successfully loaded tsconfig.json:", opts);

    // Monaco accepts the options object mostly as-is from tsconfig.json
    // We just need to handle a few incompatibilities:
    // - "bundler" moduleResolution → "node" (Monaco doesn't support bundler)
    // - Newer targets/modules → fallback to what Monaco supports
    const options: monaco.languages.typescript.CompilerOptions = {
      ...opts,
      // Override moduleResolution if it's "bundler" (not supported by Monaco)
      moduleResolution:
        opts.moduleResolution === "bundler"
          ? monaco.languages.typescript.ModuleResolutionKind.NodeJs
          : opts.moduleResolution,
    };

    console.log("[Monaco TypeScript] Configured compiler options:", options);
    return options;
  } catch (error) {
    console.warn(
      "[Monaco TypeScript] Could not load tsconfig.json, using defaults:",
      error,
    );

    // Return sensible defaults if tsconfig.json is not found
    return {
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      lib: ["ES2020", "DOM", "DOM.Iterable"],
      module: monaco.languages.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      esModuleInterop: true,
    };
  }
}

// Load TypeScript configuration asynchronously
(async () => {
  const compilerOptions = await loadTsConfigOptions();

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

  console.log("[Monaco TypeScript] Configuration complete");
})();

console.log(
  "[Monaco Workers] Full monaco-editor bundle loaded with all languages",
);

// Initialize Shiki for VS Code-quality syntax highlighting
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
        {
          name: "markdown",
          scopeName: "text.html.markdown",
          // @ts-ignore - JSON import for grammar
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
    console.log(
      "[Monaco Shiki] Available themes:",
      highlighter.getLoadedThemes(),
    );
    console.log(
      "[Monaco Shiki] Available languages:",
      highlighter.getLoadedLanguages(),
    );

    // Log which languages were successfully registered with Monaco
    const monacoLanguages = monaco.languages.getLanguages().map((l) => l.id);
    console.log(
      "[Monaco] All registered language IDs:",
      monacoLanguages.sort(),
    );

    // Enhance markdown themes with font style rules for bold/italic
    // VS Code's grammar properly tokenizes emphasis with markup.bold/italic.markdown scopes
    monaco.editor.defineTheme("dark-plus-enhanced", {
      base: "vs-dark",
      inherit: true,
      rules: [
        // Markdown emphasis styling via VS Code grammar scopes
        { token: "markup.bold.markdown", fontStyle: "bold" },
        { token: "markup.italic.markdown", fontStyle: "italic" },
        {
          token: "markup.bold.markdown.markup.italic.markdown",
          fontStyle: "italic bold",
        },
        { token: "emphasis.markdown", fontStyle: "italic" },
        { token: "strong.markdown", fontStyle: "bold" },
      ],
      colors: {},
    });

    monaco.editor.defineTheme("light-plus-enhanced", {
      base: "vs",
      inherit: true,
      rules: [
        // Markdown emphasis styling via VS Code grammar scopes
        { token: "markup.bold.markdown", fontStyle: "bold" },
        { token: "markup.italic.markdown", fontStyle: "italic" },
        {
          token: "markup.bold.markdown.markup.italic.markdown",
          fontStyle: "italic bold",
        },
        { token: "emphasis.markdown", fontStyle: "italic" },
        { token: "strong.markdown", fontStyle: "bold" },
      ],
      colors: {},
    });

    console.log(
      "[Monaco Shiki] Enhanced themes defined for markdown formatting",
    );

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
