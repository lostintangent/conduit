/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMultiSelect } from "../../../../../../src/renderer/components/panes/editor-v2/components/FileTreePanel/hooks/useMultiSelect";
import type { SelectableItem } from "../../../../../../src/renderer/components/panes/editor-v2/components/FileTreePanel/utils/types";

// ============================================================================
// Test Data
// ============================================================================

const FLAT_VISUAL_ORDER: SelectableItem[] = [
  { path: "file1.ts", type: "file" },
  { path: "file2.ts", type: "file" },
  { path: "file3.ts", type: "file" },
  { path: "file4.ts", type: "file" },
  { path: "file5.ts", type: "file" },
];

const FLAT_ALL_FILE_PATHS = [
  "file1.ts",
  "file2.ts",
  "file3.ts",
  "file4.ts",
  "file5.ts",
];

const TREE_VISUAL_ORDER: SelectableItem[] = [
  { path: "src", type: "folder" },
  { path: "src/components", type: "folder" },
  { path: "src/components/Button.tsx", type: "file" },
  { path: "src/components/Input.tsx", type: "file" },
  { path: "src/index.ts", type: "file" },
  { path: "README.md", type: "file" },
];

const TREE_ALL_FILE_PATHS = [
  "src/components/Button.tsx",
  "src/components/Input.tsx",
  "src/index.ts",
  "README.md",
];

/**
 * Helper to create a mock MouseEvent with modifier keys.
 */
function createMouseEvent(
  options: {
    shiftKey?: boolean;
    metaKey?: boolean;
    ctrlKey?: boolean;
  } = {},
): React.MouseEvent {
  return {
    shiftKey: options.shiftKey ?? false,
    metaKey: options.metaKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
  } as React.MouseEvent;
}

// ============================================================================
// Regular Click
// ============================================================================

describe("useMultiSelect - Regular Click", () => {
  it("should select single item on regular click", () => {
    const { result } = renderHook(() =>
      useMultiSelect(FLAT_VISUAL_ORDER, FLAT_ALL_FILE_PATHS),
    );

    act(() => {
      result.current.handleItemClick("file2.ts", createMouseEvent());
    });

    expect(result.current.isSelected("file2.ts")).toBe(true);
    expect(result.current.getSelectedPaths()).toEqual(["file2.ts"]);
  });

  it("should clear previous selection on regular click", () => {
    const { result } = renderHook(() =>
      useMultiSelect(FLAT_VISUAL_ORDER, FLAT_ALL_FILE_PATHS),
    );

    // Select first item
    act(() => {
      result.current.handleItemClick("file1.ts", createMouseEvent());
    });

    expect(result.current.isSelected("file1.ts")).toBe(true);

    // Select second item with regular click
    act(() => {
      result.current.handleItemClick("file3.ts", createMouseEvent());
    });

    expect(result.current.isSelected("file1.ts")).toBe(false);
    expect(result.current.isSelected("file3.ts")).toBe(true);
    expect(result.current.getSelectedPaths()).toEqual(["file3.ts"]);
  });

  it("should set anchor for subsequent shift-click", () => {
    const { result } = renderHook(() =>
      useMultiSelect(FLAT_VISUAL_ORDER, FLAT_ALL_FILE_PATHS),
    );

    act(() => {
      result.current.handleItemClick("file2.ts", createMouseEvent());
    });

    expect(result.current.anchorPath).toBe("file2.ts");
  });
});

// ============================================================================
// Shift-Click Range Selection
// ============================================================================

describe("useMultiSelect - Shift-Click Range Selection", () => {
  it("should select range from anchor to clicked item (forward)", () => {
    const { result } = renderHook(() =>
      useMultiSelect(FLAT_VISUAL_ORDER, FLAT_ALL_FILE_PATHS),
    );

    // Set anchor with regular click
    act(() => {
      result.current.handleItemClick("file2.ts", createMouseEvent());
    });

    // Shift-click to select range
    act(() => {
      result.current.handleItemClick(
        "file4.ts",
        createMouseEvent({ shiftKey: true }),
      );
    });

    expect(result.current.isSelected("file1.ts")).toBe(false);
    expect(result.current.isSelected("file2.ts")).toBe(true);
    expect(result.current.isSelected("file3.ts")).toBe(true);
    expect(result.current.isSelected("file4.ts")).toBe(true);
    expect(result.current.isSelected("file5.ts")).toBe(false);
  });

  it("should select range from anchor to clicked item (backward)", () => {
    const { result } = renderHook(() =>
      useMultiSelect(FLAT_VISUAL_ORDER, FLAT_ALL_FILE_PATHS),
    );

    // Set anchor with regular click at later position
    act(() => {
      result.current.handleItemClick("file4.ts", createMouseEvent());
    });

    // Shift-click earlier item
    act(() => {
      result.current.handleItemClick(
        "file2.ts",
        createMouseEvent({ shiftKey: true }),
      );
    });

    expect(result.current.isSelected("file1.ts")).toBe(false);
    expect(result.current.isSelected("file2.ts")).toBe(true);
    expect(result.current.isSelected("file3.ts")).toBe(true);
    expect(result.current.isSelected("file4.ts")).toBe(true);
    expect(result.current.isSelected("file5.ts")).toBe(false);
  });

  it("should replace previous selection with new range", () => {
    const { result } = renderHook(() =>
      useMultiSelect(FLAT_VISUAL_ORDER, FLAT_ALL_FILE_PATHS),
    );

    // Select first range
    act(() => {
      result.current.handleItemClick("file1.ts", createMouseEvent());
    });
    act(() => {
      result.current.handleItemClick(
        "file2.ts",
        createMouseEvent({ shiftKey: true }),
      );
    });

    expect(result.current.getSelectedPaths().sort()).toEqual([
      "file1.ts",
      "file2.ts",
    ]);

    // Shift-click to new end - should replace range
    act(() => {
      result.current.handleItemClick(
        "file5.ts",
        createMouseEvent({ shiftKey: true }),
      );
    });

    // New range from anchor (file1) to file5
    expect(result.current.getSelectedPaths().sort()).toEqual([
      "file1.ts",
      "file2.ts",
      "file3.ts",
      "file4.ts",
      "file5.ts",
    ]);
  });

  it("should fall back to regular click if no anchor set", () => {
    const { result } = renderHook(() =>
      useMultiSelect(FLAT_VISUAL_ORDER, FLAT_ALL_FILE_PATHS),
    );

    // Shift-click without prior anchor - falls through to regular click behavior
    act(() => {
      result.current.handleItemClick(
        "file3.ts",
        createMouseEvent({ shiftKey: true }),
      );
    });

    // Falls back to regular click since no anchor was set
    // (shift-click requires both anchorPath to exist AND be found in visualOrder)
    expect(result.current.getSelectedPaths()).toEqual(["file3.ts"]);
  });

  it("should work across folders in tree view", () => {
    const { result } = renderHook(() =>
      useMultiSelect(TREE_VISUAL_ORDER, TREE_ALL_FILE_PATHS),
    );

    // Click on src folder
    act(() => {
      result.current.handleItemClick("src", createMouseEvent());
    });

    // Shift-click on README.md
    act(() => {
      result.current.handleItemClick(
        "README.md",
        createMouseEvent({ shiftKey: true }),
      );
    });

    // Should select entire range including folders
    expect(result.current.getSelectedPaths().sort()).toEqual([
      "README.md",
      "src",
      "src/components",
      "src/components/Button.tsx",
      "src/components/Input.tsx",
      "src/index.ts",
    ]);
  });
});

// ============================================================================
// Cmd/Ctrl-Click Toggle Selection
// ============================================================================

describe("useMultiSelect - Cmd/Ctrl-Click Toggle", () => {
  it("should add item to selection with meta key", () => {
    const { result } = renderHook(() =>
      useMultiSelect(FLAT_VISUAL_ORDER, FLAT_ALL_FILE_PATHS),
    );

    // Select first item
    act(() => {
      result.current.handleItemClick("file1.ts", createMouseEvent());
    });

    // Cmd-click to add another
    act(() => {
      result.current.handleItemClick(
        "file3.ts",
        createMouseEvent({ metaKey: true }),
      );
    });

    expect(result.current.isSelected("file1.ts")).toBe(true);
    expect(result.current.isSelected("file3.ts")).toBe(true);
    expect(result.current.getSelectedPaths().sort()).toEqual([
      "file1.ts",
      "file3.ts",
    ]);
  });

  it("should add item to selection with ctrl key", () => {
    const { result } = renderHook(() =>
      useMultiSelect(FLAT_VISUAL_ORDER, FLAT_ALL_FILE_PATHS),
    );

    // Select first item
    act(() => {
      result.current.handleItemClick("file1.ts", createMouseEvent());
    });

    // Ctrl-click to add another
    act(() => {
      result.current.handleItemClick(
        "file3.ts",
        createMouseEvent({ ctrlKey: true }),
      );
    });

    expect(result.current.isSelected("file1.ts")).toBe(true);
    expect(result.current.isSelected("file3.ts")).toBe(true);
  });

  it("should remove item if already selected", () => {
    const { result } = renderHook(() =>
      useMultiSelect(FLAT_VISUAL_ORDER, FLAT_ALL_FILE_PATHS),
    );

    // Select multiple items
    act(() => {
      result.current.handleItemClick("file1.ts", createMouseEvent());
    });
    act(() => {
      result.current.handleItemClick(
        "file2.ts",
        createMouseEvent({ metaKey: true }),
      );
    });
    act(() => {
      result.current.handleItemClick(
        "file3.ts",
        createMouseEvent({ metaKey: true }),
      );
    });

    expect(result.current.getSelectedPaths().sort()).toEqual([
      "file1.ts",
      "file2.ts",
      "file3.ts",
    ]);

    // Cmd-click to remove file2
    act(() => {
      result.current.handleItemClick(
        "file2.ts",
        createMouseEvent({ metaKey: true }),
      );
    });

    expect(result.current.isSelected("file1.ts")).toBe(true);
    expect(result.current.isSelected("file2.ts")).toBe(false);
    expect(result.current.isSelected("file3.ts")).toBe(true);
  });

  it("should update anchor to current item", () => {
    const { result } = renderHook(() =>
      useMultiSelect(FLAT_VISUAL_ORDER, FLAT_ALL_FILE_PATHS),
    );

    act(() => {
      result.current.handleItemClick("file1.ts", createMouseEvent());
    });

    expect(result.current.anchorPath).toBe("file1.ts");

    act(() => {
      result.current.handleItemClick(
        "file4.ts",
        createMouseEvent({ metaKey: true }),
      );
    });

    expect(result.current.anchorPath).toBe("file4.ts");
  });
});

// ============================================================================
// clearSelection
// ============================================================================

describe("useMultiSelect - clearSelection", () => {
  it("should clear all selected paths", () => {
    const { result } = renderHook(() =>
      useMultiSelect(FLAT_VISUAL_ORDER, FLAT_ALL_FILE_PATHS),
    );

    // Select multiple items
    act(() => {
      result.current.handleItemClick("file1.ts", createMouseEvent());
    });
    act(() => {
      result.current.handleItemClick(
        "file3.ts",
        createMouseEvent({ shiftKey: true }),
      );
    });

    expect(result.current.getSelectedPaths().length).toBeGreaterThan(0);

    // Clear selection
    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.getSelectedPaths()).toEqual([]);
    expect(result.current.selectedPaths.size).toBe(0);
  });

  it("should reset anchor when called without argument", () => {
    const { result } = renderHook(() =>
      useMultiSelect(FLAT_VISUAL_ORDER, FLAT_ALL_FILE_PATHS),
    );

    act(() => {
      result.current.handleItemClick("file2.ts", createMouseEvent());
    });

    expect(result.current.anchorPath).toBe("file2.ts");

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.anchorPath).toBeNull();
  });

  it("should set new anchor when called with anchor argument", () => {
    const { result } = renderHook(() =>
      useMultiSelect(FLAT_VISUAL_ORDER, FLAT_ALL_FILE_PATHS),
    );

    // Set initial anchor
    act(() => {
      result.current.handleItemClick("file1.ts", createMouseEvent());
    });

    expect(result.current.anchorPath).toBe("file1.ts");

    // Clear selection with new anchor
    act(() => {
      result.current.clearSelection("file3.ts");
    });

    // Selection should be cleared
    expect(result.current.selectedPaths.size).toBe(0);
    // But anchor should be set to new value
    expect(result.current.anchorPath).toBe("file3.ts");
  });

  it("should enable shift-click from new anchor after clearSelection with anchor", () => {
    const { result } = renderHook(() =>
      useMultiSelect(FLAT_VISUAL_ORDER, FLAT_ALL_FILE_PATHS),
    );

    // Clear selection with anchor set to file2
    act(() => {
      result.current.clearSelection("file2.ts");
    });

    expect(result.current.anchorPath).toBe("file2.ts");
    expect(result.current.selectedPaths.size).toBe(0);

    // Shift-click to file4 - should select range from file2 to file4
    act(() => {
      result.current.handleItemClick(
        "file4.ts",
        createMouseEvent({ shiftKey: true }),
      );
    });

    expect(result.current.getSelectedPaths().sort()).toEqual([
      "file2.ts",
      "file3.ts",
      "file4.ts",
    ]);
  });
});

// ============================================================================
// getSelectedFilePaths (folder expansion)
// ============================================================================

describe("useMultiSelect - getSelectedFilePaths", () => {
  it("should return file paths directly", () => {
    const { result } = renderHook(() =>
      useMultiSelect(FLAT_VISUAL_ORDER, FLAT_ALL_FILE_PATHS),
    );

    act(() => {
      result.current.handleItemClick("file1.ts", createMouseEvent());
    });
    act(() => {
      result.current.handleItemClick(
        "file3.ts",
        createMouseEvent({ metaKey: true }),
      );
    });

    const filePaths = result.current.getSelectedFilePaths();
    expect(filePaths.sort()).toEqual(["file1.ts", "file3.ts"]);
  });

  it("should expand folders to contained files", () => {
    const { result } = renderHook(() =>
      useMultiSelect(TREE_VISUAL_ORDER, TREE_ALL_FILE_PATHS),
    );

    // Select the src/components folder
    act(() => {
      result.current.handleItemClick("src/components", createMouseEvent());
    });

    const filePaths = result.current.getSelectedFilePaths();

    // Should expand to files in the folder
    expect(filePaths.sort()).toEqual([
      "src/components/Button.tsx",
      "src/components/Input.tsx",
    ]);
  });

  it("should expand parent folder to all nested files", () => {
    const { result } = renderHook(() =>
      useMultiSelect(TREE_VISUAL_ORDER, TREE_ALL_FILE_PATHS),
    );

    // Select the src folder
    act(() => {
      result.current.handleItemClick("src", createMouseEvent());
    });

    const filePaths = result.current.getSelectedFilePaths();

    // Should expand to all files under src
    expect(filePaths.sort()).toEqual([
      "src/components/Button.tsx",
      "src/components/Input.tsx",
      "src/index.ts",
    ]);
  });

  it("should handle mixed file and folder selections", () => {
    const { result } = renderHook(() =>
      useMultiSelect(TREE_VISUAL_ORDER, TREE_ALL_FILE_PATHS),
    );

    // Select a folder and a file
    act(() => {
      result.current.handleItemClick("src/components", createMouseEvent());
    });
    act(() => {
      result.current.handleItemClick(
        "README.md",
        createMouseEvent({ metaKey: true }),
      );
    });

    const filePaths = result.current.getSelectedFilePaths();

    expect(filePaths.sort()).toEqual([
      "README.md",
      "src/components/Button.tsx",
      "src/components/Input.tsx",
    ]);
  });
});

// ============================================================================
// isSelected
// ============================================================================

describe("useMultiSelect - isSelected", () => {
  it("should return true for selected paths", () => {
    const { result } = renderHook(() =>
      useMultiSelect(FLAT_VISUAL_ORDER, FLAT_ALL_FILE_PATHS),
    );

    act(() => {
      result.current.handleItemClick("file2.ts", createMouseEvent());
    });

    expect(result.current.isSelected("file2.ts")).toBe(true);
  });

  it("should return false for unselected paths", () => {
    const { result } = renderHook(() =>
      useMultiSelect(FLAT_VISUAL_ORDER, FLAT_ALL_FILE_PATHS),
    );

    act(() => {
      result.current.handleItemClick("file2.ts", createMouseEvent());
    });

    expect(result.current.isSelected("file1.ts")).toBe(false);
    expect(result.current.isSelected("file3.ts")).toBe(false);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("useMultiSelect - Edge Cases", () => {
  it("should handle empty visual order", () => {
    const { result } = renderHook(() => useMultiSelect([], []));

    act(() => {
      result.current.handleItemClick("nonexistent.ts", createMouseEvent());
    });

    // Should still work, just select the item
    expect(result.current.isSelected("nonexistent.ts")).toBe(true);
  });

  it("should handle clicking item not in visual order", () => {
    const { result } = renderHook(() =>
      useMultiSelect(FLAT_VISUAL_ORDER, FLAT_ALL_FILE_PATHS),
    );

    // Set anchor
    act(() => {
      result.current.handleItemClick("file1.ts", createMouseEvent());
    });

    // Shift-click item not in visual order
    act(() => {
      result.current.handleItemClick(
        "nonexistent.ts",
        createMouseEvent({ shiftKey: true }),
      );
    });

    // Should not change selection since range can't be determined
    expect(result.current.getSelectedPaths()).toEqual(["file1.ts"]);
  });

  it("should handle selecting same item twice with shift", () => {
    const { result } = renderHook(() =>
      useMultiSelect(FLAT_VISUAL_ORDER, FLAT_ALL_FILE_PATHS),
    );

    act(() => {
      result.current.handleItemClick("file2.ts", createMouseEvent());
    });

    act(() => {
      result.current.handleItemClick(
        "file2.ts",
        createMouseEvent({ shiftKey: true }),
      );
    });

    // Should just have the one item selected
    expect(result.current.getSelectedPaths()).toEqual(["file2.ts"]);
  });
});
