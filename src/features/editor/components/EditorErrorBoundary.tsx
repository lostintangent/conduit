import type { ReactNode } from "react";
import { ErrorBoundary } from "@/components/ui/error-boundary";

/**
 * Keeps a Monaco editor that throws from taking down the pane around it, and
 * tries it again when the file changes.
 *
 * @example
 * ```tsx
 * <EditorErrorBoundary filePath={filePath}>
 *   <RegularEditorWrapper ... />
 * </EditorErrorBoundary>
 * ```
 */
export function EditorErrorBoundary({
  children,
  filePath,
}: {
  children: ReactNode;
  filePath?: string | null;
}) {
  return (
    <ErrorBoundary
      title="Editor failed to load"
      description={
        filePath
          ? `There was an error loading "${filePath.split("/").pop()}".`
          : "There was an error loading the editor."
      }
      resetKey={filePath}
    >
      {children}
    </ErrorBoundary>
  );
}
