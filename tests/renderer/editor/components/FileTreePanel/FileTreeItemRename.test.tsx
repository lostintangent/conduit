// @ts-nocheck
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FileTreeItemRename } from "../../../../../src/renderer/components/panes/editor/components/FileTreePanel/FileTreeItemRename";

// ============================================================================
// Tests
// ============================================================================

describe("FileTreeItemRename", () => {
  const mockOnCommit = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Initial Rendering
  // ===========================================================================

  describe("initial rendering", () => {
    it("should render with initial name", () => {
      render(
        <FileTreeItemRename
          initialName="test.txt"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
        />,
      );

      const input = screen.getByTestId("file-tree-rename-input");
      expect(input).toBeDefined();
      expect((input as HTMLInputElement).value).toBe("test.txt");
    });

    it("should auto-focus the input", () => {
      render(
        <FileTreeItemRename
          initialName="test.txt"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
        />,
      );

      const input = screen.getByTestId("file-tree-rename-input");
      expect(document.activeElement).toBe(input);
    });
  });

  // ===========================================================================
  // Selection Behavior
  // ===========================================================================

  describe("selection behavior", () => {
    it("should select filename without extension for files", () => {
      render(
        <FileTreeItemRename
          initialName="index.ts"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
        />,
      );

      const input = screen.getByTestId(
        "file-tree-rename-input",
      ) as HTMLInputElement;
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(5); // "index" length
    });

    it("should select entire name for directories", () => {
      render(
        <FileTreeItemRename
          initialName="components"
          isDirectory={true}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
        />,
      );

      const input = screen.getByTestId(
        "file-tree-rename-input",
      ) as HTMLInputElement;
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(10); // "components" length
    });

    it("should select entire name for files without extension", () => {
      render(
        <FileTreeItemRename
          initialName="Makefile"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
        />,
      );

      const input = screen.getByTestId(
        "file-tree-rename-input",
      ) as HTMLInputElement;
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(8); // "Makefile" length
    });

    it("should select entire name for hidden files (starting with dot)", () => {
      render(
        <FileTreeItemRename
          initialName=".gitignore"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
        />,
      );

      const input = screen.getByTestId(
        "file-tree-rename-input",
      ) as HTMLInputElement;
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(10); // ".gitignore" length
    });

    it("should handle files with multiple dots", () => {
      render(
        <FileTreeItemRename
          initialName="component.test.tsx"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
        />,
      );

      const input = screen.getByTestId(
        "file-tree-rename-input",
      ) as HTMLInputElement;
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(14); // "component.test" length (up to last dot)
    });
  });

  // ===========================================================================
  // Keyboard Handling
  // ===========================================================================

  describe("keyboard handling", () => {
    it("should commit on Enter with valid name", async () => {
      render(
        <FileTreeItemRename
          initialName="old.txt"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
        />,
      );

      const input = screen.getByTestId("file-tree-rename-input");
      fireEvent.change(input, { target: { value: "new.txt" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockOnCommit).toHaveBeenCalledWith("new.txt");
      expect(mockOnCancel).not.toHaveBeenCalled();
    });

    it("should cancel on Escape", () => {
      render(
        <FileTreeItemRename
          initialName="test.txt"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
        />,
      );

      const input = screen.getByTestId("file-tree-rename-input");
      fireEvent.keyDown(input, { key: "Escape" });

      expect(mockOnCancel).toHaveBeenCalled();
      expect(mockOnCommit).not.toHaveBeenCalled();
    });

    it("should cancel on Enter when name unchanged", () => {
      render(
        <FileTreeItemRename
          initialName="test.txt"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
        />,
      );

      const input = screen.getByTestId("file-tree-rename-input");
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockOnCancel).toHaveBeenCalled();
      expect(mockOnCommit).not.toHaveBeenCalled();
    });

    it("should not commit on Enter with invalid name", () => {
      render(
        <FileTreeItemRename
          initialName="test.txt"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
        />,
      );

      const input = screen.getByTestId("file-tree-rename-input");
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockOnCommit).not.toHaveBeenCalled();
      expect(mockOnCancel).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Blur Behavior
  // ===========================================================================

  describe("blur behavior", () => {
    it("should commit on blur with valid changed name", () => {
      render(
        <FileTreeItemRename
          initialName="old.txt"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
        />,
      );

      const input = screen.getByTestId("file-tree-rename-input");
      fireEvent.change(input, { target: { value: "new.txt" } });
      fireEvent.blur(input);

      expect(mockOnCommit).toHaveBeenCalledWith("new.txt");
    });

    it("should cancel on blur with unchanged name", () => {
      render(
        <FileTreeItemRename
          initialName="test.txt"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
        />,
      );

      const input = screen.getByTestId("file-tree-rename-input");
      fireEvent.blur(input);

      expect(mockOnCancel).toHaveBeenCalled();
      expect(mockOnCommit).not.toHaveBeenCalled();
    });

    it("should cancel on blur with invalid name", () => {
      render(
        <FileTreeItemRename
          initialName="test.txt"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
        />,
      );

      const input = screen.getByTestId("file-tree-rename-input");
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.blur(input);

      expect(mockOnCancel).toHaveBeenCalled();
      expect(mockOnCommit).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Validation
  // ===========================================================================

  describe("validation", () => {
    it("should show error for empty name", () => {
      render(
        <FileTreeItemRename
          initialName="test.txt"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
        />,
      );

      const input = screen.getByTestId("file-tree-rename-input");
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByRole("alert").textContent).toContain(
        "Name cannot be empty",
      );
    });

    it("should show error for invalid characters", () => {
      render(
        <FileTreeItemRename
          initialName="test.txt"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
        />,
      );

      const input = screen.getByTestId("file-tree-rename-input");
      fireEvent.change(input, { target: { value: "test/file.txt" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByRole("alert").textContent).toContain("cannot contain");
    });

    it("should show error for dot name", () => {
      render(
        <FileTreeItemRename
          initialName="test.txt"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
        />,
      );

      const input = screen.getByTestId("file-tree-rename-input");
      fireEvent.change(input, { target: { value: "." } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByRole("alert").textContent).toContain("Invalid name");
    });

    it("should show error for double-dot name", () => {
      render(
        <FileTreeItemRename
          initialName="test.txt"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
        />,
      );

      const input = screen.getByTestId("file-tree-rename-input");
      fireEvent.change(input, { target: { value: ".." } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByRole("alert").textContent).toContain("Invalid name");
    });

    it("should clear error when typing", () => {
      render(
        <FileTreeItemRename
          initialName="test.txt"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
        />,
      );

      const input = screen.getByTestId("file-tree-rename-input");

      // Trigger error
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(screen.getByRole("alert")).toBeDefined();

      // Type to clear error
      fireEvent.change(input, { target: { value: "valid.txt" } });
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  // ===========================================================================
  // Name Conflict Check
  // ===========================================================================

  describe("name conflict check", () => {
    it("should show error when name conflicts", () => {
      const checkConflict = vi.fn().mockReturnValue(true);

      render(
        <FileTreeItemRename
          initialName="test.txt"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
          checkNameConflict={checkConflict}
        />,
      );

      const input = screen.getByTestId("file-tree-rename-input");
      fireEvent.change(input, { target: { value: "existing.txt" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(checkConflict).toHaveBeenCalledWith("existing.txt");
      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByRole("alert").textContent).toContain("already exists");
      expect(mockOnCommit).not.toHaveBeenCalled();
    });

    it("should commit when no conflict", () => {
      const checkConflict = vi.fn().mockReturnValue(false);

      render(
        <FileTreeItemRename
          initialName="test.txt"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
          checkNameConflict={checkConflict}
        />,
      );

      const input = screen.getByTestId("file-tree-rename-input");
      fireEvent.change(input, { target: { value: "newname.txt" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(checkConflict).toHaveBeenCalledWith("newname.txt");
      expect(mockOnCommit).toHaveBeenCalledWith("newname.txt");
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("edge cases", () => {
    it("should trim whitespace from name", () => {
      render(
        <FileTreeItemRename
          initialName="test.txt"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
        />,
      );

      const input = screen.getByTestId("file-tree-rename-input");
      fireEvent.change(input, { target: { value: "  newname.txt  " } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockOnCommit).toHaveBeenCalledWith("newname.txt");
    });

    it("should stop click propagation", () => {
      const parentClick = vi.fn();

      render(
        <div onClick={parentClick}>
          <FileTreeItemRename
            initialName="test.txt"
            isDirectory={false}
            onCommit={mockOnCommit}
            onCancel={mockOnCancel}
          />
        </div>,
      );

      const input = screen.getByTestId("file-tree-rename-input");
      fireEvent.click(input);

      expect(parentClick).not.toHaveBeenCalled();
    });

    it("should have proper aria attributes for invalid state", () => {
      render(
        <FileTreeItemRename
          initialName="test.txt"
          isDirectory={false}
          onCommit={mockOnCommit}
          onCancel={mockOnCancel}
        />,
      );

      const input = screen.getByTestId("file-tree-rename-input");

      // Initially not invalid
      expect(input.getAttribute("aria-invalid")).toBe("false");

      // Trigger error
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(input.getAttribute("aria-describedby")).toBe("rename-error");
    });
  });
});
