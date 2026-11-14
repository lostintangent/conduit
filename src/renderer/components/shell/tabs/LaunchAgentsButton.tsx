import { ApplicationCommands } from "@/commands/applicationCommands";
import {
  getCommandDisplayTitle,
  useCommand,
} from "@/commands/hooks/useCommand";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { activeTabAtom } from "@/store/atoms";
import { useSelector } from "@tanstack/react-store";
import { Rocket } from "lucide-react";
import { useEffect, useState } from "react";

export function LaunchAgentsButton() {
  const launchAgentsCmd = useCommand(ApplicationCommands.AGENT_LAUNCH);
  // Pane titles change constantly, so select only the active pane's facts
  const activePaneType = useSelector(
    activeTabAtom,
    (tab) => tab?.panes[tab.activePaneId]?.type,
  );
  const activeTerminalCwd = useSelector(activeTabAtom, (tab) => {
    const pane = tab?.panes[tab.activePaneId];
    return pane?.type === "terminal" ? (pane.cwd ?? null) : null;
  });
  // A shell retitles itself as commands run, which is the cue to check
  // again for a repo created or removed without changing directory
  const activeTerminalTitle = useSelector(activeTabAtom, (tab) => {
    const pane = tab?.panes[tab.activePaneId];
    return pane?.type === "terminal" ? pane.title : undefined;
  });

  const [isInGitRepo, setIsInGitRepo] = useState(false);
  const canLaunchAgents = activePaneType === "terminal" && isInGitRepo;

  // Check if current terminal pane is in a git repository
  useEffect(() => {
    const checkGitRepo = async () => {
      if (!activeTerminalCwd) {
        setIsInGitRepo(false);
        return;
      }

      try {
        const api = window.conduit;
        const gitRoot = await api.git.findRoot(activeTerminalCwd);
        setIsInGitRepo(gitRoot !== null);
      } catch (error) {
        console.error("Failed to check git repo:", error);
        setIsInGitRepo(false);
      }
    };

    void checkGitRepo();
  }, [activeTerminalCwd, activeTerminalTitle]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="rounded-lg h-8 px-3 inline-flex items-center gap-2 text-sm font-semibold cursor-pointer transition-colors duration-150 bg-green-700 text-white hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={launchAgentsCmd.title || "Launch agents"}
          onClick={launchAgentsCmd.execute}
          disabled={launchAgentsCmd.disabled || !canLaunchAgents}
        >
          <Rocket size={16} />
          <span>Launch</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {!canLaunchAgents && activePaneType !== "terminal"
          ? "Focus a terminal pane to launch agents"
          : !canLaunchAgents && !isInGitRepo
            ? "Navigate to a git repository to launch agents"
            : getCommandDisplayTitle(launchAgentsCmd)}
      </TooltipContent>
    </Tooltip>
  );
}
