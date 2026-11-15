import { useSettings } from "@features/settings/client/queries";
import { describePane } from "@features/workbench/client/tabLabels";
import { PaneTooltip } from "@features/workbench/components/tabs/TabButton";
import type { Pane, SplitDirection } from "@features/workbench/model";
import { cn } from "@/utils";
import { UnfoldHorizontal, UnfoldVertical } from "lucide-react";

/**
 * A collapsed pane, shown as a bar across its split with the label its tab
 * would show. Clicking it expands the pane.
 */
export function CollapsedPaneBar({
  pane,
  splitDirection,
  isLastChild,
  onExpand,
}: {
  pane: Pane;
  splitDirection: SplitDirection;
  isLastChild: boolean;
  onExpand: () => void;
}) {
  const homeDirectory = useSettings((settings) => settings.homeDirectory);
  const { label, tooltip } = describePane(pane, homeDirectory);

  // Bars between columns are too narrow for a line of text, so theirs runs down
  const isVertical = splitDirection === "row";
  // Over the rest of the split, so the tooltip never covers the bar
  const tooltipSide = isVertical
    ? isLastChild
      ? "left"
      : "right"
    : isLastChild
      ? "top"
      : "bottom";
  const Icon = isVertical ? UnfoldHorizontal : UnfoldVertical;

  return (
    <PaneTooltip tooltip={tooltip} side={tooltipSide} align="start">
      <button
        type="button"
        className={cn(
          "flex items-center gap-1.5 w-full h-full overflow-hidden bg-elevated text-muted-foreground hover:bg-elevated/80 hover:text-foreground transition-colors select-none",
          isVertical ? "flex-col py-2" : "px-2",
        )}
        onClick={onExpand}
      >
        <Icon className="w-3.5 h-3.5 flex-none" />
        <span
          className={cn(
            "min-w-0 min-h-0 overflow-hidden text-ellipsis whitespace-nowrap text-[0.85rem] leading-none",
            isVertical && "[writing-mode:vertical-rl]",
          )}
        >
          {label}
        </span>
      </button>
    </PaneTooltip>
  );
}
