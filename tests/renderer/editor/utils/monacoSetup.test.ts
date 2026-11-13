/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { languages } = vi.hoisted(() => ({
  languages: {
    register: vi.fn(),
    setMonarchTokensProvider: vi.fn(),
    setLanguageConfiguration: vi.fn(),
    typescript: {
      typescriptDefaults: { setDiagnosticsOptions: vi.fn() },
      javascriptDefaults: { setDiagnosticsOptions: vi.fn() },
    },
    json: {
      jsonDefaults: {
        diagnosticsOptions: { validate: true, comments: "error" },
        setDiagnosticsOptions: vi.fn(),
      },
    },
  },
}));

vi.mock("monaco-editor", () => ({ languages }));

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

    expect(
      languages.json.jsonDefaults.setDiagnosticsOptions,
    ).toHaveBeenCalledWith({
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
