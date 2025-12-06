import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { AgentConfig } from "@shared/types";
import { useEffect, useMemo, useState } from "react";

type AgentLauncherDialogProps = {
  isOpen: boolean;
  agents: AgentConfig[];
  defaultAgentId?: string;
  onClose: () => void;
  onLaunch: (payload: {
    prompt: string;
    agentIds: string[];
    useWorktrees: boolean;
    useCurrentPaneForDefault: boolean;
  }) => Promise<void> | void;
};

export function AgentLauncherDialog({
  isOpen,
  agents,
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

  const [prompt, setPrompt] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [useWorktrees, setUseWorktrees] = useState(true);
  const [useCurrentPane, setUseCurrentPane] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    setUseWorktrees(true);
    setUseCurrentPane(false);
    setSelectedAgents(initialAgentId ? [initialAgentId] : []);
    setIsSubmitting(false);
  }, [defaultAgentId, isOpen, sortedAgents]);

  useEffect(() => {
    if (!defaultAgentId || !selectedAgents.includes(defaultAgentId)) {
      setUseCurrentPane(false);
    }
  }, [defaultAgentId, selectedAgents]);

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((current) => {
      if (current.includes(agentId)) {
        return current.filter((id) => id !== agentId);
      }
      return [...current, agentId];
    });
  };

  const canUseCurrentPane =
    Boolean(defaultAgentId) && selectedAgents.includes(defaultAgentId);

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

    setIsSubmitting(true);
    try {
      await onLaunch({
        prompt,
        agentIds: selectedAgents,
        useWorktrees,
        useCurrentPaneForDefault: useCurrentPane && canUseCurrentPane,
      });
      onClose();
    } catch (error) {
      console.error("Failed to launch agents", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="w-[640px] max-w-[92vw] gap-4 bg-popover border-white/10"
        aria-describedby={undefined}
      >
        <DialogTitle className="text-lg font-semibold text-foreground">
          Launch Agents
        </DialogTitle>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Textarea
              autoFocus
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe what you want the agents to do..."
              className="min-h-[120px] resize-none"
            />
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-muted/20 p-3">
            <label className="flex items-start gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={useWorktrees}
                onChange={(event) => setUseWorktrees(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border border-white/30 bg-transparent accent-sky-500"
              />
              <span>
                <span className="font-medium">Use worktrees (recommended)</span>
                <span className="block text-xs text-muted-foreground">
                  Create isolated branches for each launched agent. Required for
                  merging agent output later.
                </span>
              </span>
            </label>

            <label
              className={`flex items-start gap-3 text-sm ${
                canUseCurrentPane ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <input
                type="checkbox"
                checked={useCurrentPane && canUseCurrentPane}
                disabled={!canUseCurrentPane}
                onChange={(event) => setUseCurrentPane(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border border-white/30 bg-transparent accent-sky-500 disabled:opacity-50"
              />
              <span>
                <span className="font-medium">
                  Use current pane for default agent
                </span>
                <span className="block text-xs text-muted-foreground">
                  Launches the default agent in the active terminal instead of
                  creating a new pane.
                </span>
              </span>
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                Agents
              </span>
              <span className="text-xs text-muted-foreground">
                Only agents with interactive commands are shown
              </span>
            </div>
            <div className="max-h-52 space-y-2 overflow-y-auto rounded-lg border border-white/10 bg-muted/10 p-2">
              {sortedAgents.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No agents with interactive launch commands configured.
                </div>
              ) : (
                sortedAgents.map((agent) => {
                  const isSelected = selectedAgents.includes(agent.id);
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => toggleAgent(agent.id)}
                      className={`flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left transition ${
                        isSelected
                          ? "border-accent bg-accent/10"
                          : "border-white/10 hover:border-accent/60 hover:bg-white/5"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        className="mt-1 h-4 w-4 rounded border border-white/40 bg-transparent accent-sky-500"
                      />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {agent.name}
                          </span>
                          <code className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            /{agent.id}
                          </code>
                          {agent.isDefault && (
                            <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[11px] font-medium text-blue-200">
                              default
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {agent.interactiveCommand}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-white/15 px-3 py-2 text-sm font-medium text-foreground transition hover:border-white/30 hover:bg-white/5"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                canSubmit
                  ? "bg-accent text-background hover:bg-accent/90"
                  : "bg-accent/40 text-background/70"
              }`}
            >
              {isSubmitting ? "Launching..." : "Launch"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
