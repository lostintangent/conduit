/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { languages, json, typescript, loadMarkdown } = vi.hoisted(() => {
  const loadMarkdown = vi.fn(async () => ({}));
  return {
    loadMarkdown,
    languages: {
      register: vi.fn(),
      setMonarchTokensProvider: vi.fn(),
      setLanguageConfiguration: vi.fn(),
      getLanguages: vi.fn(() => [{ id: "markdown", loader: loadMarkdown }]),
      onLanguageEncountered: vi.fn(),
      // Monaco 0.57 moved these to the top level and left stubs behind
      json: { deprecated: true },
      typescript: { deprecated: true },
    },
    json: {
      jsonDefaults: {
        diagnosticsOptions: { validate: true, comments: "error" },
        setDiagnosticsOptions: vi.fn(),
      },
    },
    typescript: {
      typescriptDefaults: { setDiagnosticsOptions: vi.fn() },
      javascriptDefaults: { setDiagnosticsOptions: vi.fn() },
    },
  };
});

vi.mock("monaco-editor", () => ({ languages, json, typescript }));

// configureMonaco only runs once per module instance, so each test loads a fresh one
async function configureFreshMonaco() {
  vi.resetModules();
  const { configureMonaco } = await import(
    "../../../../src/renderer/components/panes/editor/utils/monacoSetup"
  );
  configureMonaco();
}

describe("configureMonaco", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    "zig",
    "toml",
    "makefile",
    "diff",
  ])("registers %s with a Monarch tokenizer", async (id) => {
    await configureFreshMonaco();

    expect(languages.register).toHaveBeenCalledWith(
      expect.objectContaining({ id }),
    );
    expect(languages.setMonarchTokensProvider).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ tokenizer: expect.any(Object) }),
    );
  });

  it("allows comments and trailing commas in .jsonc files", async () => {
    await configureFreshMonaco();

    expect(json.jsonDefaults.setDiagnosticsOptions).toHaveBeenCalledWith({
      validate: true,
      comments: "error",
      schemas: [
        expect.objectContaining({
          fileMatch: ["*.jsonc"],
          schema: { allowComments: true, allowTrailingCommas: true },
        }),
      ],
    });
  });

  it("turns off TypeScript and JavaScript diagnostics", async () => {
    await configureFreshMonaco();

    for (const defaults of [
      typescript.typescriptDefaults,
      typescript.javascriptDefaults,
    ]) {
      expect(defaults.setDiagnosticsOptions).toHaveBeenCalledWith({
        noSemanticValidation: true,
        noSyntaxValidation: true,
        noSuggestionDiagnostics: true,
      });
    }
  });

  // Monaco's markdown contribution registers its own handler at import time.
  // It loads the grammar module and then applies the stock configuration,
  // whose surround pairs are only brackets and backticks.
  it("adds Markdown surround pairs after Monaco's own Markdown config", async () => {
    vi.useFakeTimers();
    await configureFreshMonaco();

    const monacosOwn = (async () => {
      // LazyLanguageLoader resolves its own promise from the loader's
      await new Promise((resolve) => loadMarkdown().then(resolve));
      languages.setLanguageConfiguration("markdown", {
        surroundingPairs: [{ open: "(", close: ")" }],
      });
    })();
    for (const [id, onEncountered] of languages.onLanguageEncountered.mock
      .calls) {
      if (id === "markdown") onEncountered();
    }
    await monacosOwn;
    await vi.runAllTimersAsync();

    const markdownConfigs = languages.setLanguageConfiguration.mock.calls
      .filter(([id]) => id === "markdown")
      .map(([, config]) => config);
    expect(
      markdownConfigs[markdownConfigs.length - 1]?.surroundingPairs,
    ).toEqual(
      expect.arrayContaining([
        { open: "*", close: "*" },
        { open: "_", close: "_" },
      ]),
    );
  });

  // The shared monaco-editor mock can't tokenize, so check each definition
  // against Monaco's real Monarch compiler, which rejects unknown states,
  // unknown keyword lists and invalid regexes.
  it("compiles every tokenizer with Monaco's Monarch compiler", async () => {
    const { compile } = await import(
      // @ts-expect-error -- untyped ESM internals, imported by path to bypass the monaco-editor alias
      "../../../../node_modules/monaco-editor/esm/vs/editor/standalone/common/monarch/monarchCompile.js"
    );
    const { MONARCH_LANGUAGES } = await import(
      "../../../../src/renderer/components/panes/editor/utils/monarchLanguages"
    );

    for (const { id, tokenizer } of MONARCH_LANGUAGES) {
      expect(() => compile(id, structuredClone(tokenizer))).not.toThrow();
    }
  });
});
