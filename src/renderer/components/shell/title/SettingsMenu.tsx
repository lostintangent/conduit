import { Settings } from "lucide-react";

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

export function SettingsMenu() {
  const settingsCmd = useCommand(
    ApplicationCommands.VIEW_OPEN_KEYBOARD_SHORTCUTS,
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={settingsCmd.execute}
          className="p-1 rounded hover:bg-foreground/10 transition-colors"
          aria-label={settingsCmd.title}
          title={getCommandDisplayTitle(settingsCmd)}
        >
          <Settings className="w-4 h-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Settings</TooltipContent>
    </Tooltip>
  );
}
