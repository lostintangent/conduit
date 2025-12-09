/**
 * Agents Editor Component
 *
 * Modal wrapper for the agents editor with close dialog functionality
 */

import { useUserSettings } from "@/hooks/useUserSettings";
import { X } from "lucide-react";
import { useRef } from "react";
import {
  AgentsEditorContent,
  type AgentsEditorContentHandle,
} from "./AgentsEditorContent";

interface AgentsEditorProps {
  onClose: () => void;
}

export function AgentsEditor({ onClose }: AgentsEditorProps) {
  const userSettings = useUserSettings();
  const contentRef = useRef<AgentsEditorContentHandle>(null);

  const handleClose = () => {
    if (contentRef.current?.hasUnsavedChanges()) {
      const shouldDiscard = confirm(
        "You have unsaved changes. Are you sure you want to discard them?",
      );
      if (!shouldDiscard) return;
    }
    onClose();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800/50 flex-shrink-0">
        <h2 className="text-lg font-semibold text-white">Agent Teams</h2>
        <button
          onClick={handleClose}
          className="p-1.5 hover:bg-white/10 rounded transition-colors"
          title="Close"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Content */}
      <AgentsEditorContent ref={contentRef} userSettings={userSettings} />
    </div>
  );
}
