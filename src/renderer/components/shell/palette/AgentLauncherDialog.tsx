import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { AgentConfig, LaunchGroup } from "@shared/types";
import {
  ChevronDown,
  ChevronRight,
  Edit3,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type AgentInstance = {
  id: string;
  instructions?: string;
};

type AgentLauncherDialogProps = {
  isOpen: boolean;
  agents: AgentConfig[];
  launchGroups?: LaunchGroup[];
  defaultAgentId?: string;
  onClose: () => void;
  onLaunch: (payload: {
    prompt: string;
    agentIds: string[];
    agentInstances?: {
      [agentId: string]: {
        count: number;
        instances?: AgentInstance[];
      };
    };
    launchTarget: "same-folder" | "worktree" | "cloud-vm";
  }) => Promise<void> | void;
};

export function AgentLauncherDialog({
  isOpen,
  agents,
  launchGroups = [],
  defaultAgentId,
  onClose,
  onLaunch,
}: AgentLauncherDialogProps) {
  const sortedAgents = useMemo(() => {
    const next = [...agents].filter((agent) =>
      agent.interactiveCommand?.trim(),
    );
    next.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });
    return next;
  }, [agents]);

  const [mode, setMode] = useState<"team" | "custom">("custom");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [agentInstances, setAgentInstances] = useState<{
    [agentId: string]: {
      count: number;
      instances?: AgentInstance[];
    };
  }>({});
  const [expandedInstructions, setExpandedInstructions] = useState<Set<string>>(
    new Set(),
  );
  const [_expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [launchTarget, setLaunchTarget] = useState<
    "same-folder" | "worktree" | "cloud-vm"
  >("worktree");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCelebrating, setIsCelebrating] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const initialAgentId =
      defaultAgentId &&
      sortedAgents.find((agent) => agent.id === defaultAgentId)
        ? defaultAgentId
        : sortedAgents[0]?.id;

    setPrompt("");
    setLaunchTarget("worktree");
    setMode("custom");
    setSelectedTeamId(null);
    setSelectedAgents(initialAgentId ? [initialAgentId] : []);
    setAgentInstances(
      initialAgentId
        ? {
            [initialAgentId]: {
              count: 1,
              instances: [{ id: `${initialAgentId}-1`, instructions: "" }],
            },
          }
        : {},
    );
    setExpandedInstructions(new Set());
    setExpandedAgents(new Set());
    setIsSubmitting(false);
  }, [defaultAgentId, isOpen, sortedAgents]);

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((current) => {
      if (current.includes(agentId)) {
        // Remove agent
        const next = current.filter((id) => id !== agentId);
        setAgentInstances((prev) => {
          const updated = { ...prev };
          delete updated[agentId];
          return updated;
        });
        return next;
      }
      // Add agent with default instance
      setAgentInstances((prev) => ({
        ...prev,
        [agentId]: {
          count: 1,
          instances: [{ id: `${agentId}-1`, instructions: "" }],
        },
      }));
      return [...current, agentId];
    });
  };

  const updateAgentInstanceCount = (agentId: string, delta: number) => {
    setAgentInstances((prev) => {
      const current = prev[agentId] || {
        count: 1,
        instances: [{ id: `${agentId}-1`, instructions: "" }],
      };
      const newCount = Math.max(1, current.count + delta);

      const newInstances = [...(current.instances || [])];
      if (newCount > current.count) {
        for (let i = current.count; i < newCount; i++) {
          newInstances.push({ id: `${agentId}-${i + 1}`, instructions: "" });
        }
      } else if (newCount < current.count) {
        newInstances.splice(newCount);
      }

      return {
        ...prev,
        [agentId]: {
          count: newCount,
          instances: newInstances,
        },
      };
    });
  };

  const updateInstanceInstructions = (
    agentId: string,
    instanceIndex: number,
    instructions: string,
  ) => {
    setAgentInstances((prev) => {
      const agentData = prev[agentId] || {
        count: 1,
        instances: [{ id: `${agentId}-1`, instructions: "" }],
      };
      const updatedInstances = [...agentData.instances];
      updatedInstances[instanceIndex] = {
        ...updatedInstances[instanceIndex],
        instructions,
      };

      return {
        ...prev,
        [agentId]: {
          ...agentData,
          instances: updatedInstances,
        },
      };
    });
  };

  const toggleInstructionsExpanded = (instanceId: string) => {
    setExpandedInstructions((prev) => {
      const next = new Set(prev);
      if (next.has(instanceId)) {
        next.delete(instanceId);
      } else {
        next.add(instanceId);
      }
      return next;
    });
  };

  const loadTeam = (teamId: string) => {
    const team = launchGroups.find((g) => g.id === teamId);
    if (!team) return;

    console.log("[AgentLauncherDialog] Loading team:", {
      teamId,
      team,
      agentInstances: team.agentInstances,
    });

    setSelectedTeamId(teamId);
    setMode("team");
    setSelectedAgents(team.agentIds);
    setAgentInstances(
      team.agentInstances ||
        team.agentIds.reduce(
          (acc, id) => ({
            ...acc,
            [id]: {
              count: 1,
              instances: [{ id: `${id}-1`, instructions: "" }],
            },
          }),
          {},
        ),
    );
  };

  const switchToCustomMode = () => {
    setMode("custom");
    setSelectedTeamId(null);
  };

  const canSubmit =
    prompt.trim().length > 0 &&
    selectedAgents.length > 0 &&
    sortedAgents.length > 0 &&
    !isSubmitting;

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) {
      return;
    }

    setIsCelebrating(true);
    setIsSubmitting(true);

    // Create confetti particles
    if (buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const particleCount = 30;

      for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement("div");
        particle.className = "celebration-particle";
        particle.style.cssText = `
          position: fixed;
          left: ${buttonRect.left + buttonRect.width / 2}px;
          top: ${buttonRect.top + buttonRect.height / 2}px;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: ${["#60a5fa", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#fb923c"][i % 6]};
          pointer-events: none;
          z-index: 10000;
          animation: celebration-burst ${0.6 + Math.random() * 0.4}s ease-out forwards;
          --tx: ${(Math.random() - 0.5) * 200}px;
          --ty: ${-Math.random() * 150 - 50}px;
        `;
        document.body.appendChild(particle);

        setTimeout(() => particle.remove(), 1000);
      }
    }

    // Small delay for visual feedback
    await new Promise((resolve) => setTimeout(resolve, 300));

    try {
      console.log("[AgentLauncherDialog] Launching with payload:", {
        prompt,
        agentIds: selectedAgents,
        agentInstances,
        launchTarget,
      });
      await onLaunch({
        prompt,
        agentIds: selectedAgents,
        agentInstances,
        launchTarget,
      });
      onClose();
    } catch (error) {
      console.error("Failed to launch agents", error);
    } finally {
      setIsSubmitting(false);
      setIsCelebrating(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes celebration-burst {
          0% {
            transform: translate(0, 0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(var(--tx), var(--ty)) scale(0.3);
            opacity: 0;
          }
        }
        
        @keyframes celebration-pulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }
      `}</style>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent
          className="w-[700px] max-w-[92vw] max-h-[90vh] gap-4 bg-popover border-white/10 flex flex-col"
          aria-describedby={undefined}
        >
          <DialogTitle className="text-lg font-semibold text-foreground">
            Launch Agents
          </DialogTitle>
          <form
            className="space-y-4 flex-1 overflow-hidden flex flex-col"
            onSubmit={handleSubmit}
          >
            {/* Prompt */}
            <div className="space-y-2 flex-shrink-0">
              <Textarea
                autoFocus
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe what you want the agents to do..."
                className="min-h-[100px] resize-none"
              />
            </div>

            {/* Agent Selection */}
            <div className="space-y-2 flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between flex-shrink-0">
                <span className="text-sm font-medium text-foreground">
                  {mode === "team" ? "Team Members" : "Agents"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {mode === "custom" &&
                    "Only agents with interactive commands are shown"}
                </span>
              </div>

              {/* Team Selection - moved here */}
              {launchGroups.length > 0 && (
                <div className="flex flex-wrap gap-2 flex-shrink-0">
                  {launchGroups.map((team) => {
                    const isSelected = selectedTeamId === team.id;
                    return (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => loadTeam(team.id)}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md border text-xs transition ${
                          isSelected
                            ? "border-accent bg-accent/10 text-foreground"
                            : "border-white/10 hover:border-accent/60 hover:bg-white/5 text-muted-foreground"
                        }`}
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>{team.name}</span>
                        <span className="text-xs opacity-60">
                          ({team.agentIds.length})
                        </span>
                      </button>
                    );
                  })}

                  {mode === "team" && (
                    <button
                      type="button"
                      onClick={switchToCustomMode}
                      className="px-2 py-1.5 text-xs text-foreground hover:text-foreground transition-colors border border-accent/50 bg-accent/10 hover:bg-accent/20 rounded-md"
                    >
                      Customize
                    </button>
                  )}
                </div>
              )}

              <div className="flex-1 space-y-2 overflow-y-auto rounded-lg border border-white/10 bg-muted/10 p-2">
                {sortedAgents.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No agents with interactive launch commands configured.
                  </div>
                ) : (
                  sortedAgents.map((agent) => {
                    const isSelected = selectedAgents.includes(agent.id);
                    const instanceData = agentInstances[agent.id] || {
                      count: 1,
                      instances: [{ id: `${agent.id}-1`, instructions: "" }],
                    };

                    return (
                      <div key={agent.id} className="space-y-2">
                        <button
                          type="button"
                          onClick={() =>
                            mode === "custom" && toggleAgent(agent.id)
                          }
                          disabled={mode === "team"}
                          className={`flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left transition ${
                            isSelected
                              ? "border-accent bg-accent/10"
                              : "border-white/10 hover:border-accent/60 hover:bg-white/5"
                          } ${mode === "team" ? "cursor-default" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            disabled={mode === "team"}
                            className="h-4 w-4 rounded border border-white/40 bg-transparent accent-sky-500"
                          />
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-semibold text-foreground">
                                {agent.name}
                              </span>
                              {agent.isDefault && (
                                <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[11px] font-medium text-blue-200">
                                  default
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Instance controls */}
                          {isSelected && mode === "custom" && (
                            <div
                              className="flex items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateAgentInstanceCount(agent.id, -1);
                                }}
                                disabled={instanceData.count <= 1}
                                className="w-6 h-6 flex items-center justify-center bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded text-gray-300 text-sm"
                                title="Decrease instances"
                              >
                                −
                              </button>
                              <span className="text-xs text-muted-foreground w-8 text-center">
                                {instanceData.count}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateAgentInstanceCount(agent.id, 1);
                                }}
                                className="w-6 h-6 flex items-center justify-center bg-gray-700 hover:bg-gray-600 rounded text-gray-300 text-sm"
                                title="Increase instances"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </button>

                        {/* Instance instructions */}
                        {isSelected &&
                          instanceData.instances &&
                          instanceData.instances.map((instance, idx) => {
                            const instanceId = `${agent.id}-${idx}`;
                            const isExpanded =
                              expandedInstructions.has(instanceId);
                            const hasInstructions =
                              !!instance.instructions?.trim();

                            return (
                              <div key={instance.id} className="ml-8 space-y-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleInstructionsExpanded(instanceId)
                                  }
                                  className="flex items-center gap-2 w-full px-2 py-1 hover:bg-white/5 rounded transition-colors text-left"
                                  title={
                                    isExpanded
                                      ? "Collapse instructions"
                                      : "Expand instructions"
                                  }
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-3 h-3 text-gray-500" />
                                  ) : (
                                    <ChevronRight className="w-3 h-3 text-gray-500" />
                                  )}
                                  {hasInstructions ? (
                                    <Edit3 className="w-3 h-3 text-blue-400" />
                                  ) : (
                                    <Plus className="w-3 h-3 text-gray-500" />
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    {instanceData.count > 1
                                      ? `Instance ${idx + 1} - `
                                      : ""}
                                    Custom Instructions{" "}
                                    {hasInstructions ? "(set)" : "(optional)"}
                                  </span>
                                </button>

                                {isExpanded && (
                                  <div className="pl-6">
                                    <textarea
                                      value={instance.instructions || ""}
                                      onChange={(e) =>
                                        updateInstanceInstructions(
                                          agent.id,
                                          idx,
                                          e.target.value,
                                        )
                                      }
                                      placeholder={`Additional instructions for this ${agent.name} instance...`}
                                      className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-blue-500 resize-none"
                                      rows={3}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-1 flex-shrink-0 gap-4">
              {/* Launch Target dropdown - moved to bottom left */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <label className="text-xs text-muted-foreground whitespace-nowrap">
                  Target:
                </label>
                <select
                  value={launchTarget}
                  onChange={(e) =>
                    setLaunchTarget(
                      e.target.value as "same-folder" | "worktree" | "cloud-vm",
                    )
                  }
                  className="px-2 py-1.5 bg-background border border-white/10 rounded-md text-xs text-foreground focus:outline-none focus:border-accent"
                >
                  <option value="same-folder">Same Folder</option>
                  <option value="worktree">Worktree</option>
                  <option value="cloud-vm">Cloud VM</option>
                </select>
              </div>

              {/* Agent count and buttons */}
              <div className="flex items-center gap-3 ml-auto">
                <div className="text-xs text-muted-foreground">
                  {selectedAgents.length > 0 && (
                    <span>
                      {selectedAgents.length} agent
                      {selectedAgents.length !== 1 ? "s" : ""} selected
                      {Object.values(agentInstances).reduce(
                        (sum, data) => sum + data.count,
                        0,
                      ) > selectedAgents.length && (
                        <span>
                          {" "}
                          (
                          {Object.values(agentInstances).reduce(
                            (sum, data) => sum + data.count,
                            0,
                          )}{" "}
                          instances)
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md border border-white/15 px-3 py-2 text-sm font-medium text-foreground transition hover:border-white/30 hover:bg-white/5"
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    ref={buttonRef}
                    type="submit"
                    disabled={!canSubmit}
                    className={`rounded-md px-3 py-2 text-sm font-semibold transition relative overflow-hidden ${
                      canSubmit
                        ? "bg-accent text-background hover:bg-accent/90"
                        : "bg-accent/40 text-background/70"
                    } ${isCelebrating ? "animate-[celebration-pulse_0.3s_ease-in-out]" : ""}`}
                  >
                    <span className="flex items-center gap-2">
                      {isCelebrating && (
                        <Sparkles className="w-4 h-4 animate-spin" />
                      )}
                      {isSubmitting ? "Launching..." : "Launch"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
