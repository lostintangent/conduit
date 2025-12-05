/**
 * Global Monaco Editor Mock for Tests
 *
 * This mock is automatically loaded by Vitest for tests that import monaco-editor.
 * It provides a minimal mock of the Monaco API that tests need.
 */

import { vi } from "vitest";

// Create mock functions that can be spied on
const createMockEditor = () => {
  const mockDomNode = document.createElement("div");
  const mockViewState = {
    cursorState: [{ position: { lineNumber: 1, column: 1 } }],
    viewState: { scrollTop: 100, scrollLeft: 0 },
  };

  return {
    dispose: vi.fn(),
    getDomNode: vi.fn(() => mockDomNode),
    saveViewState: vi.fn(() => mockViewState),
    restoreViewState: vi.fn(),
    layout: vi.fn(),
    getModel: vi.fn(),
    setModel: vi.fn(),
    updateOptions: vi.fn(),
    focus: vi.fn(),
    onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
    onDidBlurEditorText: vi.fn(() => ({ dispose: vi.fn() })),
    onDidFocusEditorText: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeCursorPosition: vi.fn(() => ({ dispose: vi.fn() })),
    onDidScrollChange: vi.fn(() => ({ dispose: vi.fn() })),
  };
};

let versionCounter = 1;
let contentChangeHandler: ((e: unknown) => void) | null = null;

const createMockModel = (content: string, language?: string, uri?: unknown) => {
  let modelContent = content;
  let alternativeVersionId = versionCounter++;

  const model = {
    getValue: vi.fn(() => modelContent),
    setValue: vi.fn((newContent: string) => {
      modelContent = newContent;
      alternativeVersionId = versionCounter++;
      if (contentChangeHandler) {
        contentChangeHandler({});
      }
    }),
    getAlternativeVersionId: vi.fn(() => alternativeVersionId),
    onDidChangeContent: vi.fn((handler: (e: unknown) => void) => {
      contentChangeHandler = handler;
      return { dispose: vi.fn() };
    }),
    dispose: vi.fn(),
    uri: uri || { toString: () => "file:///test/file.ts" },
  };

  return model;
};

// Map to store models by URI for getModel lookup
const modelMap = new Map<string, ReturnType<typeof createMockModel>>();

export const editor = {
  create: vi.fn(() => createMockEditor()),
  createModel: vi.fn((content: string, language?: string, uri?: unknown) => {
    const model = createMockModel(content, language, uri);
    const uriStr = model.uri.toString();
    modelMap.set(uriStr, model);
    return model;
  }),
  createDiffEditor: vi.fn(() => ({
    setModel: vi.fn(),
    getModifiedEditor: vi.fn(() => ({
      focus: vi.fn(),
      getModel: vi.fn(() => createMockModel("")),
    })),
    updateOptions: vi.fn(),
    dispose: vi.fn(),
    layout: vi.fn(),
  })),
  getModel: vi.fn((uri: unknown) => {
    if (!uri) return null;
    const uriStr =
      typeof uri === "string"
        ? uri
        : (uri as { toString: () => string }).toString();
    return modelMap.get(uriStr) || null;
  }),
  setTheme: vi.fn(),
  defineTheme: vi.fn(),
  setModelLanguage: vi.fn(),
};

export const Uri = {
  file: (path: string) => ({
    toString: () => `file://${path}`,
    fsPath: path,
  }),
  parse: (uri: string) => ({
    fsPath: uri.replace("file://", ""),
    toString: () => uri,
  }),
};

// Export helper for tests to access content change handler
export const __testHelpers = {
  getContentChangeHandler: () => contentChangeHandler,
  resetContentChangeHandler: () => {
    contentChangeHandler = null;
  },
  resetVersionCounter: () => {
    versionCounter = 1;
  },
  resetModelMap: () => {
    modelMap.clear();
  },
  createMockEditor,
  createMockModel,
};

export default {
  editor,
  Uri,
  __testHelpers,
};
