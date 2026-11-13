/**
 * Language Detection Utility
 *
 * Centralized language detection for Monaco editor models.
 * Uses a two-tier approach:
 * 1. Exact filename matches (e.g., .gitignore, Dockerfile)
 * 2. File extension fallback (e.g., .ts → typescript)
 *
 * This ensures special files like .gitignore, Dockerfile, Makefile, etc.
 * get proper syntax highlighting.
 */

/**
 * Map exact filenames to Monaco language IDs (case-insensitive).
 *
 * Used for files without extensions or with non-standard naming conventions.
 */
const LANGUAGE_BY_FILENAME: Record<string, string> = {
  // Dockerfiles
  dockerfile: "dockerfile",
  "dockerfile.dev": "dockerfile",
  "dockerfile.prod": "dockerfile",
  "dockerfile.test": "dockerfile",

  // Makefiles
  makefile: "makefile",
  gnumakefile: "makefile",

  // Git/ignore files (use shell/ini as fallback since 'ignore' language doesn't exist)
  ".gitignore": "shell",
  ".gitattributes": "ini",
  ".gitmodules": "ini",
  ".dockerignore": "shell",
  ".prettierignore": "shell",
  ".eslintignore": "shell",
  ".npmignore": "shell",

  // Env files (use ini as fallback since 'dotenv' language doesn't exist)
  ".env": "ini",
  ".env.local": "ini",
  ".env.development": "ini",
  ".env.production": "ini",
  ".env.test": "ini",
  ".env.example": "ini",

  // NPM/Node
  ".npmrc": "ini",
  ".nvmrc": "plaintext",
  ".yarnrc": "yaml",
  ".node-version": "plaintext",

  // Editor configs
  ".editorconfig": "ini",
  ".prettierrc": "json",
  ".eslintrc": "json",

  // Other common config files
  ".browserslistrc": "plaintext",
  cname: "plaintext",
  license: "plaintext",
  authors: "plaintext",
  contributors: "plaintext",

  // Docker Compose (use yaml since 'dockercompose' doesn't exist)
  "docker-compose.yml": "yaml",
  "docker-compose.yaml": "yaml",
  "compose.yml": "yaml",
  "compose.yaml": "yaml",
};

/**
 * Map file extensions to Monaco language IDs.
 */
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  // JavaScript/TypeScript
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",

  // Data formats
  json: "json",
  // Monaco has no jsonc mode; configureMonaco allows comments in *.jsonc
  jsonc: "json",

  // Web languages
  css: "css",
  scss: "scss",
  sass: "scss",
  less: "less",
  html: "html",
  htm: "html",
  xml: "xml",

  // Markup
  md: "markdown",
  markdown: "markdown",

  // Config/data
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  config: "ini",
  properties: "ini",
  env: "ini",

  // Shell scripts
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  ps1: "powershell",

  // Programming languages
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cxx: "cpp",
  cc: "cpp",
  hh: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  rb: "ruby",
  zig: "zig",
  zon: "zig",

  // Database
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",

  // Other
  txt: "plaintext",
  dockerfile: "dockerfile",
  diff: "diff",
  patch: "diff",
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Detect the Monaco language ID from a file path.
 *
 * Uses a two-tier approach:
 * 1. Check exact filename match (e.g., .gitignore, Dockerfile)
 * 2. Fall back to file extension (e.g., .ts → typescript)
 *
 * @param filePath - Absolute or relative file path
 * @returns Monaco language ID (e.g., "typescript", "shell", "plaintext")
 *
 * @example
 * ```typescript
 * detectLanguage("/path/to/.gitignore")  // → "shell"
 * detectLanguage("/path/to/file.ts")     // → "typescript"
 * detectLanguage("/path/to/Dockerfile")  // → "dockerfile"
 * detectLanguage("/path/to/unknown")     // → "plaintext"
 * ```
 */
export function detectLanguage(filePath: string): string {
  // Extract just the filename (not the full path)
  const fileName = filePath.split("/").pop()?.toLowerCase() ?? "";

  // Check exact filename matches first (case-insensitive)
  if (LANGUAGE_BY_FILENAME[fileName]) {
    return LANGUAGE_BY_FILENAME[fileName];
  }

  // Fall back to extension-based detection
  const segments = fileName.split(".");
  if (segments.length <= 1) {
    // No extension (e.g., "Makefile", "LICENSE")
    return "plaintext";
  }

  const extension = segments[segments.length - 1] ?? "";
  if (!extension) {
    return "plaintext";
  }

  return LANGUAGE_BY_EXTENSION[extension] ?? "plaintext";
}
