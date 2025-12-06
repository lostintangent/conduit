/**
 * Agents Editor Component
 *
 * Visual interface for managing multiple AI agents that can be invoked via Cmd+P.
 */

import { Check, Edit2, Plus, Trash2, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import type { AgentConfig } from "@shared/types";
import { useUserSettings } from "@/hooks/useUserSettings";

interface AgentsEditorProps {
  onClose: () => void;
}

export function AgentsEditor({ onClose }: AgentsEditorProps) {
  const userSettings = useUserSettings();
  const [agents, setAgents] = useState<AgentConfig[]>(
    userSettings.agents || [],
  );
  const [bufferLines, setBufferLines] = useState<number>(
    userSettings.terminalPromptBufferLines || 100,
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editedAgent, setEditedAgent] = useState<AgentConfig | null>(null);

  // Sync local state when userSettings changes
  useEffect(() => {
    setAgents(userSettings.agents || []);
    setBufferLines(userSettings.terminalPromptBufferLines || 100);
  }, [userSettings.agents, userSettings.terminalPromptBufferLines]);

  const hasUnsavedChanges = () => {
    if (editedAgent === null || editingIndex === null) {
      return false;
    }
    const originalAgent = agents[editingIndex];
    return JSON.stringify(editedAgent) !== JSON.stringify(originalAgent);
  };

  const handleClose = () => {
    if (hasUnsavedChanges()) {
      const shouldDiscard = confirm(
        "You have unsaved changes. Are you sure you want to discard them?",
      );
      if (!shouldDiscard) return;
    }
    onClose();
  };

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  const handleEditAgent = (index: number) => {
    if (hasUnsavedChanges()) {
      const shouldDiscard = confirm(
        "You have unsaved changes. Are you sure you want to discard them?",
      );
      if (!shouldDiscard) return;
    }

    const agent = agents[index];
    setEditedAgent(JSON.parse(JSON.stringify(agent)));
    setEditingIndex(index);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditedAgent(null);
  };

  const handleSaveAgent = async () => {
    if (editedAgent === null || editingIndex === null) return;

    try {
      const updatedAgents = [...agents];
      updatedAgents[editingIndex] = editedAgent;

      await userSettings.updateSettings({ agents: updatedAgents });
      setEditingIndex(null);
      setEditedAgent(null);
    } catch (error) {
      console.error("Failed to save agent:", error);
      alert("Failed to save changes: " + (error as Error).message);
    }
  };

  const handleDeleteAgent = async (index: number) => {
    const agent = agents[index];

    const shouldDelete = confirm(
      `Are you sure you want to delete the "${agent.name}" agent?`,
    );
    if (!shouldDelete) return;

    if (agents.length === 1) {
      alert("Cannot delete the last agent. At least one agent is required.");
      return;
    }

    try {
      const updatedAgents = agents.filter((_, i) => i !== index);
      await userSettings.updateSettings({ agents: updatedAgents });

      if (editingIndex === index) {
        setEditingIndex(null);
        setEditedAgent(null);
      } else if (editingIndex !== null && editingIndex > index) {
        setEditingIndex(editingIndex - 1);
      }
    } catch (error) {
      console.error("Failed to delete agent:", error);
      alert("Failed to delete agent: " + (error as Error).message);
    }
  };

  const handleAddAgent = async () => {
    const newAgent: AgentConfig = {
      id: `agent-${Date.now()}`,
      name: "New Agent",
      command: "copilot -p {arg}",
      interactiveCommand: "",
      isDefault: false,
    };

    try {
      const updatedAgents = [...agents, newAgent];
      await userSettings.updateSettings({ agents: updatedAgents });

      const newIndex = updatedAgents.length - 1;
      setEditedAgent(JSON.parse(JSON.stringify(newAgent)));
      setEditingIndex(newIndex);
    } catch (error) {
      console.error("Failed to add agent:", error);
      alert("Failed to add agent: " + (error as Error).message);
    }
  };

  const handleSetDefault = async (index: number) => {
    try {
      const updatedAgents = agents.map((agent, i) => ({
        ...agent,
        isDefault: i === index,
      }));
      await userSettings.updateSettings({ agents: updatedAgents });
    } catch (error) {
      console.error("Failed to set default agent:", error);
      alert("Failed to set default agent: " + (error as Error).message);
    }
  };

  const handleUpdateBufferLines = async (value: number) => {
    setBufferLines(value);
    await userSettings.updateSettings({ terminalPromptBufferLines: value });
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[800px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Agent Configuration
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Configure AI agents for Cmd+P prompt mode
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/10 rounded transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Agents List */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Agents</h3>
              <button
                onClick={handleAddAgent}
                className="flex items-center gap-2 px-3 py-1.5 text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add Agent
              </button>
            </div>

            {agents.map((agent, index) => (
              <div
                key={agent.id}
                className="bg-gray-800/50 border border-gray-700 rounded-lg p-4"
              >
                {editingIndex === index && editedAgent ? (
                  // Edit mode
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">
                          Slash Command ID
                        </label>
                        <input
                          type="text"
                          value={editedAgent.id}
                          onChange={(e) =>
                            setEditedAgent({
                              ...editedAgent,
                              id: e.target.value,
                            })
                          }
                          className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                          placeholder="e.g., claude, codex"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Use /{editedAgent.id} in prompt mode
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">
                          Display Name
                        </label>
                        <input
                          type="text"
                          value={editedAgent.name}
                          onChange={(e) =>
                            setEditedAgent({
                              ...editedAgent,
                              name: e.target.value,
                            })
                          }
                          className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                          placeholder="e.g., Claude, Codex"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-gray-400 block mb-1">
                        Non-Interactive Launch Command
                      </label>
                      <input
                        type="text"
                        value={editedAgent.command}
                        onChange={(e) =>
                          setEditedAgent({
                            ...editedAgent,
                            command: e.target.value,
                          })
                        }
                        className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                        placeholder="e.g., copilot -p {arg}"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Used for Cmd+P prompt mode. Use{" "}
                        <code className="px-1 py-0.5 bg-gray-800 rounded text-gray-400">
                          {"{arg}"}
                        </code>{" "}
                        as a placeholder for the prompt, or omit it to use stdin
                      </p>
                    </div>

                    <div>
                      <label className="text-xs text-gray-400 block mb-1">
                        Interactive Launch Command (Optional)
                      </label>
                      <input
                        type="text"
                        value={editedAgent.interactiveCommand || ""}
                        onChange={(e) =>
                          setEditedAgent({
                            ...editedAgent,
                            interactiveCommand: e.target.value,
                          })
                        }
                        className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                        placeholder="e.g., aider"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Command to launch when creating an agent session. Leave
                        empty to use default shell
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editedAgent.isDefault}
                          onChange={(e) =>
                            setEditedAgent({
                              ...editedAgent,
                              isDefault: e.target.checked,
                            })
                          }
                          className="w-4 h-4 bg-gray-900 border border-gray-700 rounded"
                        />
                        <span className="text-sm text-gray-300">
                          Default agent
                        </span>
                      </label>

                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveAgent}
                          className="px-3 py-1.5 text-xs bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded transition-colors flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                          Save
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="px-3 py-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded transition-colors flex items-center gap-1"
                        >
                          <X className="w-3 h-3" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // View mode
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-sm font-medium text-white">
                          {agent.name}
                        </h4>
                        <code className="px-1.5 py-0.5 text-xs bg-gray-700 rounded text-gray-300">
                          /{agent.id}
                        </code>
                        {agent.isDefault && (
                          <span className="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">
                            default
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <div>
                          <span className="text-xs text-gray-500">
                            Non-interactive:{" "}
                          </span>
                          <code className="text-xs text-gray-400 font-mono">
                            {agent.command}
                          </code>
                        </div>
                        {agent.interactiveCommand && (
                          <div>
                            <span className="text-xs text-gray-500">
                              Interactive:{" "}
                            </span>
                            <code className="text-xs text-gray-400 font-mono">
                              {agent.interactiveCommand}
                            </code>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {!agent.isDefault && (
                        <button
                          onClick={() => handleSetDefault(index)}
                          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                          title="Set as default"
                        >
                          Set Default
                        </button>
                      )}
                      <button
                        onClick={() => handleEditAgent(index)}
                        className="p-1.5 hover:bg-white/10 rounded transition-colors"
                        title="Edit agent"
                      >
                        <Edit2 className="w-4 h-4 text-gray-400" />
                      </button>
                      <button
                        onClick={() => handleDeleteAgent(index)}
                        className="p-1.5 hover:bg-white/10 rounded transition-colors text-red-400"
                        title="Delete agent"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Buffer Lines Setting */}
          <div className="border-t border-gray-700 pt-4">
            <h3 className="text-sm font-semibold text-white mb-3">
              Terminal Context
            </h3>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <label className="text-xs text-gray-400 font-medium block mb-1">
                Terminal Buffer Lines
              </label>
              <input
                type="number"
                min="10"
                max="1000"
                value={bufferLines}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value)) {
                    handleUpdateBufferLines(value);
                  }
                }}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-blue-500"
              />
              <p className="mt-1.5 text-xs text-gray-500">
                Number of terminal buffer lines to include as context (default:
                100)
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-800/50">
          <p className="text-xs text-gray-500">
            Agents can be invoked in terminal prompt mode (Cmd+P) using slash
            commands like{" "}
            <code className="px-1 py-0.5 bg-gray-800 rounded text-gray-400">
              /claude
            </code>{" "}
            or{" "}
            <code className="px-1 py-0.5 bg-gray-800 rounded text-gray-400">
              /codex
            </code>
            . The default agent is used when no slash command is specified.
          </p>
        </div>
      </div>
    </div>
  );
}
