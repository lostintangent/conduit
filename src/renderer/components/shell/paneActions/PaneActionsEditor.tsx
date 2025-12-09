/**
 * Pane Actions Editor Component
 *
 * Visual interface for discovering and editing pane actions.
 * Modal wrapper for PaneActionsEditorContent.
 */

import { X } from "lucide-react";
import { useEffect } from "react";
import { PaneActionsEditorContent } from "./PaneActionsEditorContent";

interface PaneActionsEditorProps {
  onClose: () => void;
  homeDirectory: string;
  onOpenQuickPane?: (descriptor: {
    type: "editor";
    cwd: string;
    filePath?: string;
  }) => void;
}

export function PaneActionsEditor({
  onClose,
  homeDirectory,
  onOpenQuickPane,
}: PaneActionsEditorProps) {
  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[90vw] h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-semibold text-white">Pane Actions</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <PaneActionsEditorContent
          homeDirectory={homeDirectory}
          onOpenQuickPane={onOpenQuickPane}
        />
      </div>
    </div>
  );
}
