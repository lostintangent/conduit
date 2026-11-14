import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  FileTreeItemRename,
  type FileTreeItemRenameProps,
} from "./FileTreeItemRename";

describe("FileTreeItemRename", () => {
  const mockOnCommit = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Render the input for renaming `initialName`, and return it. */
  function renderRename(
    initialName = "test.txt",
    props: Partial<FileTreeItemRenameProps> = {},
  ) {
    render(
      <FileTreeItemRename
        initialName={initialName}
        isDirectory={false}
        onCommit={mockOnCommit}
        onCancel={mockOnCancel}
        {...props}
      />,
    );
    return screen.getByTestId<HTMLInputElement>("file-tree-rename-input");
  }

  /** Type `value` into the input and press Enter. */
  function submit(input: HTMLInputElement, value: string) {
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: "Enter" });
  }

  describe("initial rendering", () => {
    it("should render with initial name", () => {
      const input = renderRename();

      expect(input.value).toBe("test.txt");
    });

    it("should auto-focus the input", () => {
      const input = renderRename();

      expect(document.activeElement).toBe(input);
    });
  });

  describe("selection behavior", () => {
    it.each([
      [
        "should select filename without extension for files",
        "index.ts",
        false,
        5,
      ],
      ["should select entire name for directories", "components.v2", true, 13],
      [
        "should select entire name for files without extension",
        "Makefile",
        false,
        8,
      ],
      [
        "should select entire name for hidden files (starting with dot)",
        ".gitignore",
        false,
        10,
      ],
      // Up to the last dot, so "component.test"
      [
        "should handle files with multiple dots",
        "component.test.tsx",
        false,
        14,
      ],
    ])("%s", (_title, name, isDirectory, end) => {
      const input = renderRename(name, { isDirectory });

      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(end);
    });
  });

  describe("keyboard handling", () => {
    it("should commit on Enter with valid name", () => {
      const input = renderRename("old.txt");

      submit(input, "new.txt");
      // The tree removes the input once it commits, which blurs it
      fireEvent.blur(input);

      expect(mockOnCommit).toHaveBeenCalledTimes(1);
      expect(mockOnCommit).toHaveBeenCalledWith("new.txt");
      expect(mockOnCancel).not.toHaveBeenCalled();
    });

    it("should cancel on Escape", () => {
      const input = renderRename();

      fireEvent.keyDown(input, { key: "Escape" });

      expect(mockOnCancel).toHaveBeenCalled();
      expect(mockOnCommit).not.toHaveBeenCalled();
    });

    it("should cancel on Enter when name unchanged", () => {
      const input = renderRename();

      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockOnCancel).toHaveBeenCalled();
      expect(mockOnCommit).not.toHaveBeenCalled();
    });

    it("should not commit on Enter with invalid name", () => {
      const input = renderRename();

      submit(input, "");

      expect(mockOnCommit).not.toHaveBeenCalled();
      expect(mockOnCancel).not.toHaveBeenCalled();
    });
  });

  describe("blur behavior", () => {
    it("should commit on blur with valid changed name", () => {
      const input = renderRename("old.txt");

      fireEvent.change(input, { target: { value: "new.txt" } });
      fireEvent.blur(input);

      expect(mockOnCommit).toHaveBeenCalledWith("new.txt");
    });

    it("should cancel on blur with unchanged name", () => {
      const input = renderRename();

      fireEvent.blur(input);

      expect(mockOnCancel).toHaveBeenCalled();
      expect(mockOnCommit).not.toHaveBeenCalled();
    });

    it("should cancel on blur with invalid name", () => {
      const input = renderRename();

      fireEvent.change(input, { target: { value: "" } });
      fireEvent.blur(input);

      expect(mockOnCancel).toHaveBeenCalled();
      expect(mockOnCommit).not.toHaveBeenCalled();
    });
  });

  describe("validation", () => {
    it.each([
      ["should show error for empty name", "", "Name cannot be empty"],
      [
        "should show error for invalid characters",
        "test/file.txt",
        "cannot contain",
      ],
      ["should show error for dot name", ".", "Invalid name"],
      ["should show error for double-dot name", "..", "Invalid name"],
    ])("%s", (_title, name, error) => {
      const input = renderRename();

      submit(input, name);

      expect(screen.getByRole("alert").textContent).toContain(error);
    });

    it("should clear error when typing", () => {
      const input = renderRename();

      submit(input, "");
      expect(screen.getByRole("alert")).toBeDefined();

      fireEvent.change(input, { target: { value: "valid.txt" } });
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  describe("name conflict check", () => {
    it("should show error when name conflicts", () => {
      const checkNameConflict = vi.fn().mockReturnValue(true);
      const input = renderRename("test.txt", { checkNameConflict });

      submit(input, "existing.txt");

      expect(checkNameConflict).toHaveBeenCalledWith("existing.txt");
      expect(screen.getByRole("alert").textContent).toContain("already exists");
      expect(mockOnCommit).not.toHaveBeenCalled();
    });

    it("should commit when no conflict", () => {
      const checkNameConflict = vi.fn().mockReturnValue(false);
      const input = renderRename("test.txt", { checkNameConflict });

      submit(input, "newname.txt");

      expect(checkNameConflict).toHaveBeenCalledWith("newname.txt");
      expect(mockOnCommit).toHaveBeenCalledWith("newname.txt");
    });
  });

  describe("edge cases", () => {
    it("should trim whitespace from name", () => {
      const input = renderRename();

      submit(input, "  newname.txt  ");

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

      fireEvent.click(screen.getByTestId("file-tree-rename-input"));

      expect(parentClick).not.toHaveBeenCalled();
    });

    it("should have proper aria attributes for invalid state", () => {
      const input = renderRename();
      expect(input.getAttribute("aria-invalid")).toBe("false");

      submit(input, "");

      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(input.getAttribute("aria-describedby")).toBe("rename-error");
    });
  });
});
