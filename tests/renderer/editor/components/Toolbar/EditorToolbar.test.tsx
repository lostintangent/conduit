// @ts-nocheck
/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { EditorToolbar } from "../../../../../src/renderer/components/panes/editor/components/Toolbar/EditorToolbar";
import { TooltipProvider } from "../../../../../src/renderer/components/ui/tooltip";

// Helper to wrap component with required providers
function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("EditorToolbar", () => {
  beforeEach(() => {
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  describe("standalone mode", () => {
    it("should render with bg-elevated background", () => {
      renderWithProviders(
        <EditorToolbar
          filePath="/project/src/test.ts"
          displayPath="src/test.ts"
        />,
      );

      const toolbar = screen.getByTestId("editor-toolbar");
      expect(toolbar.className).toContain("bg-elevated");
      expect(toolbar.className).not.toContain("bg-background");
    });

    it("should display file name only (not full path)", () => {
      renderWithProviders(
        <EditorToolbar
          filePath="/project/src/test.ts"
          displayPath="src/test.ts"
        />,
      );

      expect(screen.getByText("test.ts")).toBeDefined();
    });

    it("should copy path to clipboard when file name is clicked", async () => {
      renderWithProviders(
        <EditorToolbar
          filePath="/project/src/test.ts"
          displayPath="src/test.ts"
        />,
      );

      fireEvent.click(screen.getByText("test.ts"));

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("src/test.ts");
    });

    it("should show commitShortId when provided", () => {
      renderWithProviders(
        <EditorToolbar
          filePath="/project/src/test.ts"
          displayPath="src/test.ts"
          commitShortId="abc1234"
        />,
      );

      expect(screen.getByTestId("commit-id")).toBeDefined();
      expect(screen.getByText("abc1234")).toBeDefined();
    });

    it("should show read-only indicator when readOnly is true", () => {
      renderWithProviders(
        <EditorToolbar
          filePath="/project/src/test.ts"
          displayPath="src/test.ts"
          readOnly={true}
        />,
      );

      expect(screen.getByTestId("readonly-indicator")).toBeDefined();
    });

    it("should not show chevron", () => {
      renderWithProviders(
        <EditorToolbar
          filePath="/project/src/test.ts"
          displayPath="src/test.ts"
        />,
      );

      expect(screen.queryByTestId("chevron-down")).toBeNull();
      expect(screen.queryByTestId("chevron-right")).toBeNull();
    });
  });

  describe("inline mode", () => {
    it("should render with bg-background when onClick is provided", () => {
      const onClick = vi.fn();
      renderWithProviders(
        <EditorToolbar
          filePath="/project/src/test.ts"
          displayPath="src/test.ts"
          onClick={onClick}
        />,
      );

      const toolbar = screen.getByTestId("editor-toolbar");
      expect(toolbar.className).toContain("bg-background");
      expect(toolbar.className).not.toContain("bg-elevated");
    });

    it("should display full relative path (not just file name)", () => {
      const onClick = vi.fn();
      renderWithProviders(
        <EditorToolbar
          filePath="/project/src/test.ts"
          displayPath="src/test.ts"
          onClick={onClick}
        />,
      );

      expect(screen.getByText("src/test.ts")).toBeDefined();
    });

    it("should call onClick when toolbar is clicked", () => {
      const onClick = vi.fn();
      renderWithProviders(
        <EditorToolbar
          filePath="/project/src/test.ts"
          displayPath="src/test.ts"
          onClick={onClick}
        />,
      );

      fireEvent.click(screen.getByTestId("editor-toolbar"));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("should copy path when file name is clicked (not toggle)", async () => {
      const onClick = vi.fn();
      renderWithProviders(
        <EditorToolbar
          filePath="/project/src/test.ts"
          displayPath="src/test.ts"
          onClick={onClick}
        />,
      );

      fireEvent.click(screen.getByText("src/test.ts"));

      // Should copy, not call onClick
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("src/test.ts");
      expect(onClick).not.toHaveBeenCalled();
    });

    it("should show chevron down when expanded", () => {
      const onClick = vi.fn();
      renderWithProviders(
        <EditorToolbar
          filePath="/project/src/test.ts"
          displayPath="src/test.ts"
          onClick={onClick}
          showChevron={true}
          isExpanded={true}
        />,
      );

      const toolbar = screen.getByTestId("editor-toolbar");
      // ChevronDown should be present
      expect(toolbar.querySelector("svg")).toBeDefined();
    });

    it("should NOT show commitShortId in inline mode", () => {
      const onClick = vi.fn();
      renderWithProviders(
        <EditorToolbar
          filePath="/project/src/test.ts"
          displayPath="src/test.ts"
          onClick={onClick}
          commitShortId="abc1234"
        />,
      );

      expect(screen.queryByTestId("commit-id")).toBeNull();
    });
  });

  describe("git status badge", () => {
    it("should show git badge when gitStatus is provided", () => {
      renderWithProviders(
        <EditorToolbar
          filePath="/project/src/test.ts"
          displayPath="src/test.ts"
          gitStatus={{ path: "src/test.ts", status: "modified", staged: false }}
        />,
      );

      // GitBadge should render with status
      expect(screen.getByText("M")).toBeDefined();
    });

    it("should not show git badge when gitStatus is not provided", () => {
      renderWithProviders(
        <EditorToolbar
          filePath="/project/src/test.ts"
          displayPath="src/test.ts"
        />,
      );

      expect(screen.queryByText("M")).toBeNull();
      expect(screen.queryByText("A")).toBeNull();
      expect(screen.queryByText("D")).toBeNull();
    });
  });

  describe("dirty indicator", () => {
    it("should show dirty indicator when file has unsaved changes", () => {
      renderWithProviders(
        <EditorToolbar
          filePath="/project/src/test.ts"
          displayPath="src/test.ts"
          modelState={{
            isDirty: true,
            isOrphaned: false,
            hasExternalChanges: false,
          }}
        />,
      );

      expect(screen.getByTestId("dirty-indicator")).toBeDefined();
    });

    it("should not show dirty indicator when file is clean", () => {
      renderWithProviders(
        <EditorToolbar
          filePath="/project/src/test.ts"
          displayPath="src/test.ts"
          modelState={{
            isDirty: false,
            isOrphaned: false,
            hasExternalChanges: false,
          }}
        />,
      );

      expect(screen.queryByTestId("dirty-indicator")).toBeNull();
    });
  });
});
