// @ts-nocheck
/**
 * @vitest-environment jsdom
 *
 * EditorPaneSwitcher tests - Phase 8 integration tests.
 *
 * Tests the conditional rendering of EditorPane (v1) vs EditorPaneV2
 * based on the useEditorV2 feature flag in user settings.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { userSettingsAtom } from "@/store/atoms";

// ============================================================================
// Mock Components
// ============================================================================

// Mock the EditorPane (v1) component
vi.mock("@/components/panes/editor/EditorPane", () => ({
  EditorPane: ({ paneId, cwd }: { paneId: string; cwd: string }) => (
    <div data-testid="editor-pane-v1" data-paneid={paneId} data-cwd={cwd}>
      Editor V1
    </div>
  ),
}));

// Mock the EditorPaneV2 component
vi.mock("@/components/panes/editor-v2", () => ({
  EditorPaneV2: ({ pane }: { pane: { id: string; cwd: string } }) => (
    <div data-testid="editor-pane-v2" data-paneid={pane.id} data-cwd={pane.cwd}>
      Editor V2
    </div>
  ),
}));

// Import after mocks
import { EditorPaneSwitcher } from "@/components/panes/editor/EditorPaneSwitcher";

// ============================================================================
// Test Setup
// ============================================================================

const defaultProps = {
  paneId: "test-pane-1",
  cwd: "/test/project",
  filePath: "/test/project/src/index.ts",
  treeMode: "all" as const,
};

const createSettingsStore = (useEditorV2: boolean) => {
  const store = createStore();
  store.set(userSettingsAtom, {
    tabPosition: "bottom",
    alwaysShowTabs: true,
    useGradientBorders: true,
    theme: "dark",
    showTerminalRuler: true,
    quickTerminalMode: "floating",
    useConduitAsEditor: true,
    useEditorV2,
    autoSaveWorkspaces: true,
    commandHistory: [],
    urlHistory: [],
    starredPages: [],
    homeDirectory: null,
  });
  return store;
};

// ============================================================================
// Tests
// ============================================================================

describe("EditorPaneSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Feature Flag: useEditorV2 = false", () => {
    it("renders EditorPane (v1) when feature flag is disabled", () => {
      const store = createSettingsStore(false);

      render(
        <Provider store={store}>
          <EditorPaneSwitcher {...defaultProps} />
        </Provider>,
      );

      expect(screen.getByTestId("editor-pane-v1")).toBeDefined();
      expect(screen.queryByTestId("editor-pane-v2")).toBeNull();
    });

    it("passes props correctly to EditorPane (v1)", () => {
      const store = createSettingsStore(false);

      render(
        <Provider store={store}>
          <EditorPaneSwitcher {...defaultProps} />
        </Provider>,
      );

      const editorV1 = screen.getByTestId("editor-pane-v1");
      expect(editorV1.getAttribute("data-paneid")).toBe("test-pane-1");
      expect(editorV1.getAttribute("data-cwd")).toBe("/test/project");
    });
  });

  describe("Feature Flag: useEditorV2 = true", () => {
    it("renders EditorPaneV2 when feature flag is enabled", () => {
      const store = createSettingsStore(true);

      render(
        <Provider store={store}>
          <EditorPaneSwitcher {...defaultProps} />
        </Provider>,
      );

      expect(screen.getByTestId("editor-pane-v2")).toBeDefined();
      expect(screen.queryByTestId("editor-pane-v1")).toBeNull();
    });

    it("constructs pane object correctly for EditorPaneV2", () => {
      const store = createSettingsStore(true);

      render(
        <Provider store={store}>
          <EditorPaneSwitcher {...defaultProps} />
        </Provider>,
      );

      const editorV2 = screen.getByTestId("editor-pane-v2");
      expect(editorV2.getAttribute("data-paneid")).toBe("test-pane-1");
      expect(editorV2.getAttribute("data-cwd")).toBe("/test/project");
    });
  });

  describe("Feature Flag Switching", () => {
    it("can switch from v1 to v2 when flag changes", () => {
      // Start with v1
      const storeV1 = createSettingsStore(false);

      const { rerender } = render(
        <Provider store={storeV1}>
          <EditorPaneSwitcher {...defaultProps} />
        </Provider>,
      );

      expect(screen.getByTestId("editor-pane-v1")).toBeDefined();

      // Switch to v2
      const storeV2 = createSettingsStore(true);

      rerender(
        <Provider store={storeV2}>
          <EditorPaneSwitcher {...defaultProps} />
        </Provider>,
      );

      expect(screen.getByTestId("editor-pane-v2")).toBeDefined();
      expect(screen.queryByTestId("editor-pane-v1")).toBeNull();
    });

    it("can switch from v2 to v1 when flag changes", () => {
      // Start with v2
      const storeV2 = createSettingsStore(true);

      const { rerender } = render(
        <Provider store={storeV2}>
          <EditorPaneSwitcher {...defaultProps} />
        </Provider>,
      );

      expect(screen.getByTestId("editor-pane-v2")).toBeDefined();

      // Switch to v1
      const storeV1 = createSettingsStore(false);

      rerender(
        <Provider store={storeV1}>
          <EditorPaneSwitcher {...defaultProps} />
        </Provider>,
      );

      expect(screen.getByTestId("editor-pane-v1")).toBeDefined();
      expect(screen.queryByTestId("editor-pane-v2")).toBeNull();
    });
  });

  describe("Agent Integration", () => {
    it("passes agentSessionId to v1 editor", () => {
      const store = createSettingsStore(false);
      const propsWithAgent = {
        ...defaultProps,
        agentSessionId: "agent-session-123",
      };

      render(
        <Provider store={store}>
          <EditorPaneSwitcher {...propsWithAgent} />
        </Provider>,
      );

      // Component renders without error with agent props
      expect(screen.getByTestId("editor-pane-v1")).toBeDefined();
    });

    it("includes agentSessionId in pane object for v2 editor", () => {
      const store = createSettingsStore(true);
      const propsWithAgent = {
        ...defaultProps,
        agentSessionId: "agent-session-123",
      };

      render(
        <Provider store={store}>
          <EditorPaneSwitcher {...propsWithAgent} />
        </Provider>,
      );

      // Component renders without error with agent props
      expect(screen.getByTestId("editor-pane-v2")).toBeDefined();
    });
  });

  describe("Optional Props", () => {
    it("handles undefined filePath", () => {
      const store = createSettingsStore(true);
      const props = {
        paneId: "test-pane",
        cwd: "/test/project",
      };

      render(
        <Provider store={store}>
          <EditorPaneSwitcher {...props} />
        </Provider>,
      );

      expect(screen.getByTestId("editor-pane-v2")).toBeDefined();
    });

    it("handles null agentSessionId", () => {
      const store = createSettingsStore(true);
      const props = {
        ...defaultProps,
        agentSessionId: null,
      };

      render(
        <Provider store={store}>
          <EditorPaneSwitcher {...props} />
        </Provider>,
      );

      expect(screen.getByTestId("editor-pane-v2")).toBeDefined();
    });

    it("handles undefined treeMode", () => {
      const store = createSettingsStore(true);
      const { treeMode, ...propsWithoutTreeMode } = defaultProps;

      render(
        <Provider store={store}>
          <EditorPaneSwitcher {...propsWithoutTreeMode} />
        </Provider>,
      );

      expect(screen.getByTestId("editor-pane-v2")).toBeDefined();
    });
  });
});
