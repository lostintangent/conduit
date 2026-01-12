// @ts-nocheck
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "../../../../../src/renderer/components/ui/tooltip";
import { ExternalChangeWarning } from "../../../../../src/renderer/components/panes/editor-v2/components/EditorPane/ExternalChangeWarning";

// Helper to wrap component with required providers
function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

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
      const { container } = renderWithProviders(
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
      const { container } = renderWithProviders(
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
      renderWithProviders(
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
      renderWithProviders(
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
      renderWithProviders(
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

    it("should display deleted file message", () => {
      expect(screen.getByText(/file was deleted externally/i)).toBeDefined();
    });

    it("should display unsaved changes warning", () => {
      expect(screen.getByText(/unsaved changes will be lost/i)).toBeDefined();
    });

    it("should mention saving to recreate file", () => {
      expect(screen.getByText(/save to recreate/i)).toBeDefined();
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
      renderWithProviders(
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

    it("should display external modification message", () => {
      expect(screen.getByText(/modified externally/i)).toBeDefined();
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
      renderWithProviders(
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
      renderWithProviders(
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
      renderWithProviders(
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

  describe("warning display", () => {
    it("should show consistent message for deleted files", () => {
      renderWithProviders(
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

      // Should show the deleted file message
      expect(screen.getByText(/file was deleted externally/i)).toBeDefined();
    });

    it("should show consistent message for modified files", () => {
      renderWithProviders(
        <ExternalChangeWarning
          filePath="file.ts"
          isOrphaned={false}
          hasExternalChanges={true}
          isDirty={true}
          onReload={mockOnReload}
          onKeepChanges={mockOnKeepChanges}
          onSave={mockOnSave}
        />,
      );

      expect(screen.getByText(/modified externally/i)).toBeDefined();
    });
  });

  // ===========================================================================
  // Accessibility
  // ===========================================================================

  describe("accessibility", () => {
    it("should have alert role", () => {
      renderWithProviders(
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
    it("should show save button when orphaned even if not dirty", () => {
      // Save button is always available for orphaned files so user can recreate
      renderWithProviders(
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

      expect(screen.getByTestId("warning-save-button")).toBeDefined();
    });
  });
});
