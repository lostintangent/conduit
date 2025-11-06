import { useAtomValue } from "jotai";
import { Keyboard, Settings, Zap } from "lucide-react";

import { ApplicationCommands } from "@/commands/applicationCommands";
import {
  getCommandDisplayTitle,
  useCommand,
} from "@/commands/hooks/useCommand";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { userSettingsAtom } from "@/store/atoms";
import type { UserSettings } from "@shared/types";

type SettingsMenuProps = {
  onUpdateSettings: (updates: Partial<UserSettings>) => void;
};

export const SettingsMenu = ({ onUpdateSettings }: SettingsMenuProps) => {
  const { alwaysShowTabs, showTerminalRuler, autoSaveWorkspaces, useGradientBorders, useConduitAsEditor } =
    useAtomValue(userSettingsAtom);

  const keyboardShortcutsCmd = useCommand(
    ApplicationCommands.VIEW_OPEN_KEYBOARD_SHORTCUTS
  );
  const paneActionsCmd = useCommand(
    ApplicationCommands.VIEW_OPEN_PANE_ACTIONS
  );

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className="p-1 rounded text-white mt-1 hover:bg-white/10 transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Settings</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuCheckboxItem
          checked={alwaysShowTabs}
          onClick={() =>
            onUpdateSettings({ alwaysShowTabs: !alwaysShowTabs })
          }
        >
          Always show tabs
        </DropdownMenuCheckboxItem>

        <DropdownMenuCheckboxItem
          checked={showTerminalRuler}
          onClick={() =>
            onUpdateSettings({ showTerminalRuler: !showTerminalRuler })
          }
        >
          Show terminal ruler
        </DropdownMenuCheckboxItem>

        <DropdownMenuCheckboxItem
          checked={autoSaveWorkspaces}
          onClick={() =>
            onUpdateSettings({ autoSaveWorkspaces: !autoSaveWorkspaces })
          }
        >
          Auto-save workspaces
        </DropdownMenuCheckboxItem>

        <DropdownMenuCheckboxItem
          checked={useGradientBorders}
          onClick={() =>
            onUpdateSettings({ useGradientBorders: !useGradientBorders })
          }
        >
          Use gradient borders
        </DropdownMenuCheckboxItem>

        <DropdownMenuCheckboxItem
          checked={useConduitAsEditor}
          onClick={() =>
            onUpdateSettings({ useConduitAsEditor: !useConduitAsEditor })
          }
        >
          Use Conduit as editor
        </DropdownMenuCheckboxItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={keyboardShortcutsCmd.execute}
          title={getCommandDisplayTitle(keyboardShortcutsCmd)}
        >
          <Keyboard className="w-4 h-4 mr-2" />
          {keyboardShortcutsCmd.title}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={paneActionsCmd.execute}
          title={getCommandDisplayTitle(paneActionsCmd)}
        >
          <Zap className="w-4 h-4 mr-2" />
          {paneActionsCmd.title}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
