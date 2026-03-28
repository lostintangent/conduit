/**
 * FileTreeItemRename - Inline rename input for file tree items.
 *
 * Provides an in-place text input for renaming files and folders:
 * - Auto-focuses and selects the filename (without extension for files)
 * - Enter commits the rename
 * - Escape cancels without changes
 * - Blur commits if valid and changed, otherwise cancels
 * - Validates for empty names and invalid characters
 *
 * @example
 * ```tsx
 * <FileTreeItemRename
 *   initialName="index.ts"
 *   isDirectory={false}
 *   onCommit={(newName) => handleRename(newName)}
 *   onCancel={() => setRenamingPath(null)}
 * />
 * ```
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/utils";

/**
 * Characters that are invalid in file/folder names across platforms.
 */
const INVALID_CHARS_REGEX = /[/\\:*?"<>|]/;

/**
 * Validate a file/folder name.
 * Returns an error message if invalid, null if valid.
 */
function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Name cannot be empty";
  }
  if (INVALID_CHARS_REGEX.test(trimmed)) {
    return 'Name cannot contain / \\ : * ? " < > |';
  }
  if (trimmed === "." || trimmed === "..") {
    return "Invalid name";
  }
  return null;
}

/**
 * Get the selection range for a filename.
 * For files, selects up to (but not including) the last dot.
 * For directories or files without extensions, selects everything.
 */
function getSelectionRange(
  name: string,
  isDirectory: boolean,
): [number, number] {
  if (isDirectory) {
    return [0, name.length];
  }
  const lastDot = name.lastIndexOf(".");
  // Select up to the extension (but not the dot or extension)
  // Only if there's a dot that's not at the start (hidden files like .gitignore)
  if (lastDot > 0) {
    return [0, lastDot];
  }
  return [0, name.length];
}

export interface FileTreeItemRenameProps {
  /** The current name of the file/folder */
  initialName: string;

  /** Whether this is a directory (affects selection behavior) */
  isDirectory: boolean;

  /** Callback when rename is committed with the new name */
  onCommit: (newName: string) => void;

  /** Callback when rename is cancelled */
  onCancel: () => void;

  /**
   * Optional callback to check if a sibling with this name already exists.
   * Returns true if the name conflicts with an existing sibling.
   */
  checkNameConflict?: (name: string) => boolean;
}

/**
 * Inline rename input component.
 */
export function FileTreeItemRename({
  initialName,
  isDirectory,
  onCommit,
  onCancel,
  checkNameConflict,
}: FileTreeItemRenameProps) {
  const [value, setValue] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Track if we're currently committing to prevent double-commits
  const isCommittingRef = useRef(false);

  // Auto-focus and select on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      const [start, end] = getSelectionRange(initialName, isDirectory);
      inputRef.current.setSelectionRange(start, end);
    }
  }, [initialName, isDirectory]);

  /**
   * Validate and commit the rename if valid.
   * Returns true if committed, false if validation failed.
   */
  const tryCommit = useCallback((): boolean => {
    if (isCommittingRef.current) return false;

    const trimmedValue = value.trim();

    // If unchanged, just cancel
    if (trimmedValue === initialName) {
      onCancel();
      return true;
    }

    // Validate
    const validationError = validateName(trimmedValue);
    if (validationError) {
      setError(validationError);
      return false;
    }

    // Check for name conflicts
    if (checkNameConflict?.(trimmedValue)) {
      setError("A file or folder with this name already exists");
      return false;
    }

    // Commit
    isCommittingRef.current = true;
    onCommit(trimmedValue);
    return true;
  }, [value, initialName, onCommit, onCancel, checkNameConflict]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        tryCommit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    },
    [tryCommit, onCancel],
  );

  const handleBlur = useCallback(() => {
    // On blur, try to commit. If validation fails, cancel instead.
    if (!tryCommit()) {
      // If tryCommit returned false due to validation error,
      // and it's not because we're already committing, cancel
      if (!isCommittingRef.current) {
        onCancel();
      }
    }
  }, [tryCommit, onCancel]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    setError(null); // Clear error on change
  }, []);

  // Prevent click from propagating to parent (which would trigger selection)
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div className="flex-1 min-w-0 flex items-center">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onClick={handleClick}
        className={cn(
          "w-full bg-background border rounded px-1 py-0 text-[13px] text-foreground",
          "focus:outline-none focus:ring-1 focus:ring-accent",
          error && "border-destructive focus:ring-destructive",
        )}
        aria-invalid={!!error}
        aria-describedby={error ? "rename-error" : undefined}
        data-testid="file-tree-rename-input"
      />
      {error && (
        <div
          id="rename-error"
          className="absolute left-0 top-full mt-1 px-2 py-1 text-xs text-destructive-foreground bg-destructive rounded shadow-lg z-50 whitespace-nowrap"
          role="alert"
        >
          {error}
        </div>
      )}
    </div>
  );
}
