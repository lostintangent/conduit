/**
 * Multi-Launch Prompt Component
 *
 * Modal overlay for initiating multi-agent launches via Cmd+I.
 */

import { getLayoutDescription } from "@/utils/multiLaunchLayout";
import type { AgentConfig } from "@shared/types";
import { Rocket, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

interface MultiLaunchPromptProps {
  onClose: () => void;
  onLaunch: (prompt: string, createWorktrees: boolean) => void;
  enabledAgents: AgentConfig[];
  initialCreateWorktrees?: boolean;
  onWorktreePreferenceChange?: (createWorktrees: boolean) => void;
}

export function MultiLaunchPrompt({
  onClose,
  onLaunch,
  enabledAgents,
  initialCreateWorktrees = true,
  onWorktreePreferenceChange,
}: MultiLaunchPromptProps) {
  const [prompt, setPrompt] = useState("");
  const [createWorktrees, setCreateWorktrees] = useState(
    initialCreateWorktrees,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onLaunch(prompt.trim(), createWorktrees);
      onClose();
    }
  };

  const handleWorktreeToggle = (checked: boolean) => {
    setCreateWorktrees(checked);
    onWorktreePreferenceChange?.(checked);
  };

  const layoutDescription = getLayoutDescription(enabledAgents.length);

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border-2 border-purple-500/50 rounded-lg shadow-2xl w-[600px] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded">
              <Rocket className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Multi-Launch Prompt
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Launch {enabledAgents.length} agent
                {enabledAgents.length !== 1 ? "s" : ""} simultaneously
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="px-6 py-5">
          {/* Prompt Input */}
          <div className="mb-5">
            <label className="text-sm text-gray-300 font-medium block mb-2">
              Enter task for all agents:
            </label>
            <input
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
              placeholder="e.g., Implement user authentication with JWT"
              autoComplete="off"
            />
          </div>

          {/* Agent List */}
          <div className="mb-5">
            <p className="text-xs text-gray-400 font-medium mb-2">
              Enabled agents:
            </p>
            <div className="space-y-1">
              {enabledAgents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 rounded"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div>
                  <span className="text-sm text-white font-medium">
                    {agent.name}
                  </span>
                  <code className="text-xs text-gray-500 font-mono ml-auto">
                    {agent.launchCommand}
                  </code>
                </div>
              ))}
            </div>
          </div>

          {/* Layout Info */}
          <div className="mb-4 px-4 py-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
            <p className="text-xs text-purple-300">
              <span className="font-medium">Layout:</span> {layoutDescription}
            </p>
          </div>

          {/* Worktree Option */}
          <div className="mb-6">
            <label className="flex items-center gap-2 px-4 py-3 bg-gray-800/30 border border-gray-700 rounded-lg cursor-pointer hover:bg-gray-800/50 transition-colors">
              <input
                type="checkbox"
                checked={createWorktrees}
                onChange={(e) => handleWorktreeToggle(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:ring-offset-0"
              />
              <div className="flex-1">
                <span className="text-sm text-gray-200 font-medium">
                  Create isolated git worktrees
                </span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Each agent will run in a separate git branch. Uncheck to run
                  all agents in the same directory.
                </p>
              </div>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!prompt.trim()}
              className="px-6 py-2 text-sm bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-purple-500 flex items-center gap-2"
            >
              <Rocket className="w-4 h-4" />
              Launch
            </button>
          </div>
        </form>

        {/* Footer Hint */}
        <div className="px-6 py-3 border-t border-gray-700 bg-gray-800/30">
          <p className="text-xs text-gray-500">
            {createWorktrees
              ? "Each agent will run in its own isolated git worktree."
              : "All agents will run in the same directory."}{" "}
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-400">
              Enter
            </kbd>{" "}
            to launch •{" "}
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-400">
              Esc
            </kbd>{" "}
            to cancel
          </p>
        </div>
      </div>
    </div>
  );
}
