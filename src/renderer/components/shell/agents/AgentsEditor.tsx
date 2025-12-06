/**
 * Agents Editor Component
 *
 * Visual interface for managing multiple AI agents that can be invoked via Cmd+P.
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserSettings } from "@/hooks/useUserSettings";
import type { AgentConfig, LaunchGroup } from "@shared/types";
import {
  Check,
  Edit2,
  MessageSquare,
  Plus,
  RotateCcw,
  Terminal,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { DEFAULT_AGENTS } from "./defaultAgents";

interface AgentsEditorProps {
  onClose: () => void;
}

export function AgentsEditor({ onClose }: AgentsEditorProps) {
  const userSettings = useUserSettings();
  const [activeTab, setActiveTab] = useState("agents");
  const [agents, setAgents] = useState<AgentConfig[]>(
    userSettings.agents || [],
  );
  const [launchGroups, setLaunchGroups] = useState<LaunchGroup[]>(
    userSettings.launchGroups || [],
  );
  const [bufferLines, setBufferLines] = useState<number>(
    userSettings.terminalPromptBufferLines || 100,
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editedAgent, setEditedAgent] = useState<AgentConfig | null>(null);
  const [editingGroupIndex, setEditingGroupIndex] = useState<number | null>(
    null,
  );
  const [editedGroup, setEditedGroup] = useState<LaunchGroup | null>(null);

  // Sync local state when userSettings changes
  useEffect(() => {
    setAgents(userSettings.agents || []);
    setLaunchGroups(userSettings.launchGroups || []);
    setBufferLines(userSettings.terminalPromptBufferLines || 100);
  }, [
    userSettings.agents,
    userSettings.launchGroups,
    userSettings.terminalPromptBufferLines,
  ]);

  const hasUnsavedChanges = () => {
    if (editedAgent !== null && editingIndex !== null) {
      const originalAgent = agents[editingIndex];
      return JSON.stringify(editedAgent) !== JSON.stringify(originalAgent);
    }
    if (editedGroup !== null && editingGroupIndex !== null) {
      const originalGroup = launchGroups[editingGroupIndex];
      return JSON.stringify(editedGroup) !== JSON.stringify(originalGroup);
    }
    return false;
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

  const handleResetToDefaults = async () => {
    const shouldReset = confirm(
      "Are you sure you want to reset all agents to defaults? This will replace all current agents.",
    );
    if (!shouldReset) return;

    try {
      await userSettings.updateSettings({ agents: DEFAULT_AGENTS });
      setEditingIndex(null);
      setEditedAgent(null);
    } catch (error) {
      console.error("Failed to reset agents:", error);
      alert("Failed to reset agents: " + (error as Error).message);
    }
  };

  // Teams handlers
  const handleAddGroup = async () => {
    const newGroup: LaunchGroup = {
      id: `team-${Date.now()}`,
      name: "New Team",
      agentIds: [],
    };

    try {
      const updatedGroups = [...launchGroups, newGroup];
      await userSettings.updateSettings({ launchGroups: updatedGroups });

      const newIndex = updatedGroups.length - 1;
      setEditedGroup(JSON.parse(JSON.stringify(newGroup)));
      setEditingGroupIndex(newIndex);
    } catch (error) {
      console.error("Failed to add team:", error);
      alert("Failed to add team: " + (error as Error).message);
    }
  };

  const handleEditGroup = (index: number) => {
    if (hasUnsavedChanges()) {
      const shouldDiscard = confirm(
        "You have unsaved changes. Are you sure you want to discard them?",
      );
      if (!shouldDiscard) return;
    }

    const group = launchGroups[index];
    setEditedGroup(JSON.parse(JSON.stringify(group)));
    setEditingGroupIndex(index);
  };

  const handleCancelEditGroup = () => {
    setEditingGroupIndex(null);
    setEditedGroup(null);
  };

  const handleSaveGroup = async () => {
    if (editedGroup === null || editingGroupIndex === null) return;

    try {
      const updatedGroups = [...launchGroups];
      updatedGroups[editingGroupIndex] = editedGroup;

      await userSettings.updateSettings({ launchGroups: updatedGroups });
      setEditingGroupIndex(null);
      setEditedGroup(null);
    } catch (error) {
      console.error("Failed to save team:", error);
      alert("Failed to save changes: " + (error as Error).message);
    }
  };

  const handleDeleteGroup = async (index: number) => {
    const group = launchGroups[index];

    const shouldDelete = confirm(
      `Are you sure you want to delete the "${group.name}" team?`,
    );
    if (!shouldDelete) return;

    try {
      const updatedGroups = launchGroups.filter((_, i) => i !== index);
      await userSettings.updateSettings({ launchGroups: updatedGroups });

      if (editingGroupIndex === index) {
        setEditingGroupIndex(null);
        setEditedGroup(null);
      } else if (editingGroupIndex !== null && editingGroupIndex > index) {
        setEditingGroupIndex(editingGroupIndex - 1);
      }
    } catch (error) {
      console.error("Failed to delete team:", error);
      alert("Failed to delete team: " + (error as Error).message);
    }
  };

  const toggleAgentInGroup = (agentId: string) => {
    if (!editedGroup) return;

    const updatedAgentIds = editedGroup.agentIds.includes(agentId)
      ? editedGroup.agentIds.filter((id) => id !== agentId)
      : [...editedGroup.agentIds, agentId];

    setEditedGroup({
      ...editedGroup,
      agentIds: updatedAgentIds,
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-8"
      onClick={handleClose}
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
            onClick={handleClose}
            className="p-2 hover:bg-white/10 rounded transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Tabs - Flex container */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="flex items-center justify-between px-6 py-2 border-b border-gray-700 flex-shrink-0">
            <TabsList className="flex-shrink-0 border-b-0 w-auto">
              <TabsTrigger value="agents">Agents</TabsTrigger>
              <TabsTrigger value="groups">Teams</TabsTrigger>
            </TabsList>

            {/* Action buttons - shown inline with tabs */}
            <div className="flex gap-2 flex-shrink-0">
              {activeTab === "agents" ? (
                <>
                  <button
                    onClick={handleResetToDefaults}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-gray-500/10 hover:bg-gray-500/20 text-gray-400 rounded transition-colors"
                    title="Reset to default agents"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                  <button
                    onClick={handleAddAgent}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Add Agent
                  </button>
                </>
              ) : (
                <button
                  onClick={handleAddGroup}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add Team
                </button>
              )}
            </div>
          </div>

          {/* Agents Tab */}
          <TabsContent value="agents" className="flex flex-col min-h-0 flex-1">
            {/* Scrollable Agents List */}
            <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
              <div className="space-y-2">
                {agents.map((agent, index) => {
                  // Hide other agents when editing
                  if (editingIndex !== null && editingIndex !== index) {
                    return null;
                  }

                  return (
                    <div
                      key={agent.id}
                      className="bg-gray-800/50 border border-gray-700 rounded-lg p-3"
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
                              as a placeholder for the prompt, or omit it to use
                              stdin
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
                              Command to launch when creating an agent session.
                              Leave empty to use default shell
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
                        // View mode - Compact
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-white truncate">
                              {agent.name}
                            </h4>
                            <code className="px-1.5 py-0.5 text-xs bg-gray-700 rounded text-gray-300 flex-shrink-0">
                              /{agent.id}
                            </code>
                            {agent.isDefault && (
                              <span className="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded flex-shrink-0">
                                default
                              </span>
                            )}
                            {/* Command indicators */}
                            <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                              {agent.command && (
                                <div
                                  className="flex items-center gap-1 text-xs text-gray-500"
                                  title="Has non-interactive command"
                                >
                                  <Terminal className="w-3 h-3" />
                                </div>
                              )}
                              {agent.interactiveCommand && (
                                <div
                                  className="flex items-center gap-1 text-xs text-gray-500"
                                  title="Has interactive command"
                                >
                                  <MessageSquare className="w-3 h-3" />
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
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
                              <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                            </button>
                            <button
                              onClick={() => handleDeleteAgent(index)}
                              className="p-1.5 hover:bg-white/10 rounded transition-colors text-red-400"
                              title="Delete agent"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Terminal Context - Fixed at bottom */}
            <div className="px-6 py-4 border-t border-gray-700 bg-gray-800/30 flex-shrink-0">
              <div className="flex items-center gap-4">
                <label className="text-xs text-gray-400 font-medium whitespace-nowrap">
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
                  className="w-24 px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 flex-1">
                  Lines to include as context (default: 100)
                </p>
              </div>
            </div>
          </TabsContent>

          {/* Teams Tab */}
          <TabsContent value="groups" className="flex flex-col min-h-0 flex-1">
            {/* Scrollable Groups List */}
            <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
              {launchGroups.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No teams yet</p>
                  <p className="text-xs mt-1">
                    Create a team to deploy multiple agents at once
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {launchGroups.map((group, index) => {
                    // Hide other groups when editing
                    if (
                      editingGroupIndex !== null &&
                      editingGroupIndex !== index
                    ) {
                      return null;
                    }

                    return (
                      <div
                        key={group.id}
                        className="bg-gray-800/50 border border-gray-700 rounded-lg p-3"
                      >
                        {editingGroupIndex === index && editedGroup ? (
                          // Edit mode
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs text-gray-400 block mb-1">
                                Team Name
                              </label>
                              <input
                                type="text"
                                value={editedGroup.name}
                                onChange={(e) =>
                                  setEditedGroup({
                                    ...editedGroup,
                                    name: e.target.value,
                                  })
                                }
                                className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                                placeholder="e.g., Full Stack Team"
                              />
                            </div>

                            <div>
                              <label className="text-xs text-gray-400 block mb-2">
                                Select Agents
                              </label>
                              <div className="space-y-2 max-h-64 overflow-y-auto">
                                {agents.map((agent) => (
                                  <label
                                    key={agent.id}
                                    className="flex items-center gap-2 px-3 py-2 bg-gray-900 rounded hover:bg-gray-800 cursor-pointer transition-colors"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={editedGroup.agentIds.includes(
                                        agent.id,
                                      )}
                                      onChange={() =>
                                        toggleAgentInGroup(agent.id)
                                      }
                                      className="w-4 h-4 bg-gray-900 border border-gray-700 rounded"
                                    />
                                    <span className="text-sm text-gray-300 flex-1">
                                      {agent.name}
                                    </span>
                                    <code className="px-1.5 py-0.5 text-xs bg-gray-700 rounded text-gray-400">
                                      /{agent.id}
                                    </code>
                                  </label>
                                ))}
                              </div>
                              <p className="mt-2 text-xs text-gray-500">
                                Selected: {editedGroup.agentIds.length} agent(s)
                              </p>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                              <button
                                onClick={handleSaveGroup}
                                className="px-3 py-1.5 text-xs bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded transition-colors flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" />
                                Save
                              </button>
                              <button
                                onClick={handleCancelEditGroup}
                                className="px-3 py-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded transition-colors flex items-center gap-1"
                              >
                                <X className="w-3 h-3" />
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          // View mode
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Users className="w-4 h-4 text-gray-400" />
                                <h4 className="text-sm font-medium text-white">
                                  {group.name}
                                </h4>
                              </div>
                              <div className="space-y-1">
                                <div>
                                  <span className="text-xs text-gray-500">
                                    Agents:{" "}
                                  </span>
                                  {group.agentIds.length === 0 ? (
                                    <span className="text-xs text-gray-600 italic">
                                      No agents selected
                                    </span>
                                  ) : (
                                    <span className="text-xs text-gray-400">
                                      {group.agentIds
                                        .map((id) => {
                                          const agent = agents.find(
                                            (a) => a.id === id,
                                          );
                                          return agent ? agent.name : id;
                                        })
                                        .join(", ")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEditGroup(index)}
                                className="p-1.5 hover:bg-white/10 rounded transition-colors"
                                title="Edit team"
                              >
                                <Edit2 className="w-4 h-4 text-gray-400" />
                              </button>
                              <button
                                onClick={() => handleDeleteGroup(index)}
                                className="p-1.5 hover:bg-white/10 rounded transition-colors text-red-400"
                                title="Delete team"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-800/50 flex-shrink-0">
          {activeTab === "agents" ? (
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
          ) : (
            <p className="text-xs text-gray-500">
              Teams allow you to start multiple agent sessions at once. Use them
              to quickly assemble your preferred development team.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
