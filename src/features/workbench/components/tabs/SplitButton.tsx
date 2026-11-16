import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

type SplitButtonProps = {
  /** Names the main button, and is its tooltip unless `tooltip` is given */
  label: string;
  tooltip?: string;
  /** The main button's icon, with anything drawn over it */
  icon: ReactNode;
  onClick: () => void;
  /** Names the chevron that opens the menu */
  menuLabel: string;
  /** The menu's items, which act on the workbench */
  children: ReactNode;
};

/** A tab strip button that does one thing, with a menu of related ones next to it */
export function SplitButton({
  label,
  tooltip = label,
  icon,
  onClick,
  menuLabel,
  children,
}: SplitButtonProps) {
  return (
    <div className="group flex items-stretch shrink-0 transition-colors duration-150 hover:bg-foreground/15 focus-within:bg-foreground/15 rounded-lg overflow-hidden">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="w-6 h-8 inline-flex items-center justify-center transition-colors duration-150 hover:bg-foreground/10 relative"
            aria-label={label}
            onClick={onClick}
          >
            {icon}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltip}</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="w-4 h-8 inline-flex items-center justify-center transition-colors duration-150 hover:bg-foreground/10"
            aria-label={menuLabel}
          >
            <ChevronDown size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" focusPaneOnSelect>
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
