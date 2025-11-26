// @ts-nocheck
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExternalChangeWarning } from "../../../../src/renderer/components/panes/editor-v2/components/EditorViewPanel/ExternalChangeWarning";

// ============================================================================
// Tests
// ============================================================================

describe("ExternalChangeWarning", () => {
  // Handlers
  const mockOnReload = vi.fn();
  const mockOnKeepChanges = vi.fn();
  const mockOnSave = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Rendering Conditions
  // ===========================================================================

  describe("rendering conditions", () => {
    it("should not render when no warning conditions exist", () => {
      const { container } = render(
        <ExternalChangeWarning
          filePath="/test/file.ts"
          isOrphaned={false}
          hasExternalChanges={false}
          isDirty={false}
          onReload={mockOnReload}
          onKeepChanges={mockOnKeepChanges}
          onSave={mockOnSave}
        />,
      );

      expect(container.firstChild).toBeNull();
    });

    it("should not render when hasExternalChanges is true but isDirty is false", () => {
      // This scenario means file changed externally but we have no local changes
      // File should auto-reload, no warning needed
      const { container } = render(
        <ExternalChangeWarning
          filePath="/test/file.ts"
          isOrphaned={false}
          hasExternalChanges={true}
          isDirty={false}
          onReload={mockOnReload}
          onKeepChanges={mockOnKeepChanges}
          onSave={mockOnSave}
        />,
      );

      expect(container.firstChild).toBeNull();
    });

    it("should render when file is orphaned", () => {
      render(
        <ExternalChangeWarning
          filePath="/test/file.ts"
          isOrphaned={true}
          hasExternalChanges={false}
          isDirty={true}
          onReload={mockOnReload}
          onKeepChanges={mockOnKeepChanges}
          onSave={mockOnSave}
        />,
      );

      expect(screen.getByTestId("external-change-warning")).toBeDefined();
    });

    it("should render when file has conflict (external changes + dirty)", () => {
      render(
        <ExternalChangeWarning
          filePath="/test/file.ts"
          isOrphaned={false}
          hasExternalChanges={true}
          isDirty={true}
          onReload={mockOnReload}
          onKeepChanges={mockOnKeepChanges}
          onSave={mockOnSave}
        />,
      );

      expect(screen.getByTestId("external-change-warning")).toBeDefined();
    });
  });

  // ===========================================================================
  // Orphaned File State
  // ===========================================================================

  describe("orphaned file state", () => {
    beforeEach(() => {
      render(
        <ExternalChangeWarning
          filePath="/test/myfile.ts"
          isOrphaned={true}
          hasExternalChanges={false}
          isDirty={true}
          onReload={mockOnReload}
          onKeepChanges={mockOnKeepChanges}
          onSave={mockOnSave}
        />,
      );
    });

    it("should display 'File Deleted' title", () => {
      expect(screen.getByText("File Deleted:")).toBeDefined();
    });

    it("should display filename in message", () => {
      expect(screen.getByText(/myfile.ts/)).toBeDefined();
    });

    it("should display deletion message", () => {
      expect(screen.getByText(/has been deleted/)).toBeDefined();
    });

    it("should show save button for orphaned files", () => {
      expect(screen.getByTestId("warning-save-button")).toBeDefined();
    });

    it("should NOT show reload button for orphaned files", () => {
      expect(screen.queryByTestId("warning-reload-button")).toBeNull();
    });

    it("should show dismiss button", () => {
      expect(screen.getByTestId("warning-dismiss-button")).toBeDefined();
    });
  });

  // ===========================================================================
  // Conflict State (External Changes + Dirty)
  // ===========================================================================

  describe("conflict state", () => {
    beforeEach(() => {
      render(
        <ExternalChangeWarning
          filePath="/test/conflicted.ts"
          isOrphaned={false}
          hasExternalChanges={true}
          isDirty={true}
          onReload={mockOnReload}
          onKeepChanges={mockOnKeepChanges}
          onSave={mockOnSave}
        />,
      );
    });

    it("should display 'External Changes Detected' title", () => {
      expect(screen.getByText("External Changes Detected:")).toBeDefined();
    });

    it("should display filename in message", () => {
      expect(screen.getByText(/conflicted.ts/)).toBeDefined();
    });

    it("should display external changes message", () => {
      expect(screen.getByText(/has been modified externally/)).toBeDefined();
    });

    it("should show reload button for conflicts", () => {
      expect(screen.getByTestId("warning-reload-button")).toBeDefined();
    });

    it("should show save button for conflicts", () => {
      expect(screen.getByTestId("warning-save-button")).toBeDefined();
    });

    it("should show dismiss button", () => {
      expect(screen.getByTestId("warning-dismiss-button")).toBeDefined();
    });
  });

  // ===========================================================================
  // Button Actions
  // ===========================================================================

  describe("button actions", () => {
    it("should call onReload when reload button is clicked", () => {
      render(
        <ExternalChangeWarning
          filePath="/test/file.ts"
          isOrphaned={false}
          hasExternalChanges={true}
          isDirty={true}
          onReload={mockOnReload}
          onKeepChanges={mockOnKeepChanges}
          onSave={mockOnSave}
        />,
      );

      fireEvent.click(screen.getByTestId("warning-reload-button"));
      expect(mockOnReload).toHaveBeenCalledTimes(1);
    });

    it("should call onSave when save button is clicked", () => {
      render(
        <ExternalChangeWarning
          filePath="/test/file.ts"
          isOrphaned={true}
          hasExternalChanges={false}
          isDirty={true}
          onReload={mockOnReload}
          onKeepChanges={mockOnKeepChanges}
          onSave={mockOnSave}
        />,
      );

      fireEvent.click(screen.getByTestId("warning-save-button"));
      expect(mockOnSave).toHaveBeenCalledTimes(1);
    });

    it("should call onKeepChanges when dismiss button is clicked", () => {
      render(
        <ExternalChangeWarning
          filePath="/test/file.ts"
          isOrphaned={true}
          hasExternalChanges={false}
          isDirty={true}
          onReload={mockOnReload}
          onKeepChanges={mockOnKeepChanges}
          onSave={mockOnSave}
        />,
      );

      fireEvent.click(screen.getByTestId("warning-dismiss-button"));
      expect(mockOnKeepChanges).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // File Path Display
  // ===========================================================================

  describe("file path display", () => {
    it("should extract filename from path", () => {
      render(
        <ExternalChangeWarning
          filePath="/very/long/path/to/important-file.tsx"
          isOrphaned={true}
          hasExternalChanges={false}
          isDirty={true}
          onReload={mockOnReload}
          onKeepChanges={mockOnKeepChanges}
          onSave={mockOnSave}
        />,
      );

      // Should show just the filename, not the full path
      expect(screen.getByText(/important-file.tsx/)).toBeDefined();
    });

    it("should handle file path without directories", () => {
      render(
        <ExternalChangeWarning
          filePath="file.ts"
          isOrphaned={true}
          hasExternalChanges={false}
          isDirty={true}
          onReload={mockOnReload}
          onKeepChanges={mockOnKeepChanges}
          onSave={mockOnSave}
        />,
      );

      expect(screen.getByText(/file.ts/)).toBeDefined();
    });
  });

  // ===========================================================================
  // Accessibility
  // ===========================================================================

  describe("accessibility", () => {
    it("should have alert role", () => {
      render(
        <ExternalChangeWarning
          filePath="/test/file.ts"
          isOrphaned={true}
          hasExternalChanges={false}
          isDirty={true}
          onReload={mockOnReload}
          onKeepChanges={mockOnKeepChanges}
          onSave={mockOnSave}
        />,
      );

      expect(screen.getByRole("alert")).toBeDefined();
    });
  });

  // ===========================================================================
  // Save Button Visibility
  // ===========================================================================

  describe("save button visibility", () => {
    it("should not show save button when orphaned but not dirty", () => {
      render(
        <ExternalChangeWarning
          filePath="/test/file.ts"
          isOrphaned={true}
          hasExternalChanges={false}
          isDirty={false}
          onReload={mockOnReload}
          onKeepChanges={mockOnKeepChanges}
          onSave={mockOnSave}
        />,
      );

      expect(screen.queryByTestId("warning-save-button")).toBeNull();
    });
  });
});
