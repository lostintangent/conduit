import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePackageJsonScripts } from "@/hooks/usePackageJsonScripts";
import { useSettings } from "@features/settings/client/queries";
import { Play } from "lucide-react";

type RepoScriptsMenuProps = {
  cwd?: string | null;
  onRunScript?: (script: string) => void;
};

/**
 * RepoScriptsMenu displays a play button that shows a dropdown of npm scripts
 * found in package.json. Only rendered when the showPlayButton setting is enabled.
 */
export function RepoScriptsMenu({ cwd, onRunScript }: RepoScriptsMenuProps) {
  const showPlayButton = useSettings((s) => s.showPlayButton ?? false);

  const { scripts } = usePackageJsonScripts(cwd);
  const hasScripts = scripts && Object.keys(scripts).length > 0;

  // Don't render if the setting is disabled or there are no scripts or no handler
  if (!showPlayButton || !hasScripts || !onRunScript) {
    return null;
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white"
            >
              <Play size={16} />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="center">
          Run npm script
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="w-56 max-h-[400px] overflow-y-auto"
        side="left"
      >
        {Object.entries(scripts || {}).map(([scriptName, scriptCommand]) => (
          <DropdownMenuItem
            key={scriptName}
            onClick={() => onRunScript(scriptName)}
            className="cursor-pointer"
          >
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <span className="font-medium">{scriptName}</span>
              <span className="text-xs text-muted-foreground truncate">
                {scriptCommand}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
