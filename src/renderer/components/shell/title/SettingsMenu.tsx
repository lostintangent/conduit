import { useAtomValue } from "jotai";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Fullscreen,
  Keyboard,
  Monitor,
  Moon,
  Palette,
  PictureInPicture2,
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

const quickTerminalModeOptions = new Map<"fullscreen" | "floating", LucideIcon>(
  [
    ["fullscreen", Fullscreen],
    ["floating", PictureInPicture2],
  ],
);

type SettingsMenuProps = {
  onUpdateSettings: (updates: Partial<UserSettings>) => void;
  onOpenTerminalFontSettings: () => void;
};

export function SettingsMenu({
  onUpdateSettings,
  onOpenTerminalFontSettings,
}: SettingsMenuProps) {
  const {
    alwaysShowTabs,
    showTerminalRuler,
    autoSaveWorkspaces,
    useGradientBorders,
    useConduitAsEditor,
    theme,
    quickTerminalMode = "floating",
  } = useAtomValue(userSettingsAtom);

  const CurrentThemeIcon = themeOptions.get(theme);

  const keyboardShortcutsCmd = useCommand(
    ApplicationCommands.VIEW_OPEN_KEYBOARD_SHORTCUTS,
  );
  const paneActionsCmd = useCommand(ApplicationCommands.VIEW_OPEN_PANE_ACTIONS);
  const agentsCmd = useCommand(ApplicationCommands.VIEW_OPEN_AGENTS);

  return (
    <DropdownMenu>
      {/* Settings button w/tooltip */}
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className="p-1 rounded hover:bg-foreground/10 transition-colors"
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
          <DropdownMenuSubTrigger className="flex items-center justify-between gap-5 group">
            <span>Theme</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground group-hover:text-foreground">
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
                  value === theme && "magic",
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

        {/* Quick terminal mode selection submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Quick terminal mode</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {Array.from(quickTerminalModeOptions.entries()).map(
              ([value, Icon]) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() => onUpdateSettings({ quickTerminalMode: value })}
                  className={cn(
                    "flex items-center justify-between gap-2",
                    value === quickTerminalMode && "magic",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    {capitalize(value)}
                  </span>
                </DropdownMenuItem>
              ),
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Advanced settings submenu (TODO: Make this list dynamic) */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Advanced settings</DropdownMenuSubTrigger>
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

            <DropdownMenuItem onClick={onOpenTerminalFontSettings}>
              Terminal Font Settings...
            </DropdownMenuItem>

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

        <DropdownMenuItem
          onClick={agentsCmd.execute}
          title={getCommandDisplayTitle(agentsCmd)}
        >
          <Bot className="w-4 h-4 mr-2" />
          {agentsCmd.title}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
