import { useAtomValue } from "jotai";
import type { LucideIcon } from "lucide-react";
import {
  ChevronRight,
  Keyboard,
  Monitor,
  Moon,
  Palette,
  Settings,
  Sun,
} from "lucide-react";

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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { userSettingsAtom } from "@/store/atoms";
import { capitalize, cn } from "@/utils";
import type { ThemeMode, UserSettings } from "@shared/types";

const themeOptions = new Map<ThemeMode, LucideIcon>([
  ["light", Sun],
  ["dark", Moon],
  ["system", Monitor],
]);

type SettingsMenuProps = {
  onUpdateSettings: (updates: Partial<UserSettings>) => void;
};

export function SettingsMenu({ onUpdateSettings }: SettingsMenuProps) {
  const {
    alwaysShowTabs,
    showTerminalRuler,
    autoSaveWorkspaces,
    useGradientBorders,
    useConduitAsEditor,
    theme,
  } = useAtomValue(userSettingsAtom);

  const CurrentThemeIcon = themeOptions.get(theme);

  const keyboardShortcutsCmd = useCommand(
    ApplicationCommands.VIEW_OPEN_KEYBOARD_SHORTCUTS,
  );
  const paneActionsCmd = useCommand(ApplicationCommands.VIEW_OPEN_PANE_ACTIONS);

  return (
    <DropdownMenu>
      {/* Settings button w/tooltip */}
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className="p-1 rounded text-white hover:bg-white/10 transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Settings</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end">
        {/* Theme selection submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex items-center justify-between gap-2">
            <span>Color theme</span>
            <span className="flex items-center gap-2 text-xs text-white/70">
              <CurrentThemeIcon className="w-4 h-4" />
              {capitalize(theme)}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {Array.from(themeOptions.entries()).map(([value, Icon]) => (
              <DropdownMenuItem
                key={value}
                onClick={() => onUpdateSettings({ theme: value })}
                className={cn(
                  "flex items-center justify-between gap-2",
                  value === theme &&
                    "bg-gradient-to-br from-accent-start to-accent-end text-white",
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  {capitalize(value)}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Advanced settings submenu (TODO: Make this list dynamic) */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex items-center justify-between gap-2">
            <span>Advanced settings</span>
            <ChevronRight className="w-4 h-4 opacity-70" />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuCheckboxItem
              checked={alwaysShowTabs}
              onClick={() =>
                onUpdateSettings({ alwaysShowTabs: !alwaysShowTabs })
              }
            >
              Always show tabs
            </DropdownMenuCheckboxItem>

            <DropdownMenuCheckboxItem
              checked={autoSaveWorkspaces}
              onClick={() =>
                onUpdateSettings({ autoSaveWorkspaces: !autoSaveWorkspaces })
              }
            >
              Auto-save workspaces
            </DropdownMenuCheckboxItem>

            <DropdownMenuSeparator />

            <DropdownMenuCheckboxItem
              checked={useGradientBorders}
              onClick={() =>
                onUpdateSettings({ useGradientBorders: !useGradientBorders })
              }
            >
              Show gradient borders
            </DropdownMenuCheckboxItem>

            <DropdownMenuCheckboxItem
              checked={showTerminalRuler}
              onClick={() =>
                onUpdateSettings({ showTerminalRuler: !showTerminalRuler })
              }
            >
              Show terminal ruler
            </DropdownMenuCheckboxItem>

            <DropdownMenuSeparator />

            <DropdownMenuCheckboxItem
              checked={useConduitAsEditor}
              onClick={() =>
                onUpdateSettings({ useConduitAsEditor: !useConduitAsEditor })
              }
            >
              Use Conduit as $EDITOR
            </DropdownMenuCheckboxItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

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
          <Palette className="w-4 h-4 mr-2" />
          {paneActionsCmd.title}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
