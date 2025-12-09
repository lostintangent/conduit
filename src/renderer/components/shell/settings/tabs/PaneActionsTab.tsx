/**
 * Pane Actions Tab Component
 *
 * Wrapper for the pane actions editor functionality
 */

import { PaneActionsEditorContent } from "../../paneActions/PaneActionsEditorContent";

interface PaneActionsTabProps {
  homeDirectory: string;
  onOpenQuickPane?: (descriptor: {
    type: "editor";
    cwd: string;
    filePath?: string;
  }) => void;
}

export function PaneActionsTab({
  homeDirectory,
  onOpenQuickPane,
}: PaneActionsTabProps) {
  return (
    <PaneActionsEditorContent
      homeDirectory={homeDirectory}
      onOpenQuickPane={onOpenQuickPane}
    />
  );
}
