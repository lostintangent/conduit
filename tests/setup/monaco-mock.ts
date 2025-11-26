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

export const editor = {
  create: vi.fn(() => createMockEditor()),
  createModel: vi.fn((content: string, language?: string, uri?: unknown) =>
    createMockModel(content, language, uri),
  ),
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
  createMockEditor,
  createMockModel,
};

export default {
  editor,
  Uri,
  __testHelpers,
};
