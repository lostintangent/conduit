/**
 * Agents Editor Component
 *
 * Visual interface for managing multiple AI agents that can be invoked via Cmd+P.
 * Modal wrapper for AgentsEditorContent.
 */

import { X } from "lucide-react";
import { useEffect } from "react";
import { useUserSettings } from "@/hooks/useUserSettings";
import { AgentsEditorContent } from "./AgentsEditorContent";

interface AgentsEditorProps {
  onClose: () => void;
}

export function AgentsEditor({ onClose }: AgentsEditorProps) {
  const userSettings = useUserSettings();

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
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-8"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[900px] h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-white">Agent Teams</h2>
            <p className="text-xs text-gray-400 mt-1">
              Configure your AI agents and virtual teams
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <AgentsEditorContent userSettings={userSettings} />
      </div>
    </div>
  );
}
