import { AgentIndicator } from "@/ui/agent-indicator";
import { AnimatedShinyText } from "@/ui/animated-shiny-text";
import { IdleIndicator } from "@/ui/idle-indicator";
import { Separator } from "@/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import {
  closeTab,
  focusTab,
  setTabMuted,
  updateTabProperty,
} from "@features/workbench/client/actions/tab";
import { useSettings } from "@features/settings/client/queries";
import { LabelIcon } from "./LabelIcon";
import { SoundButton } from "./SoundButton";
import { tabLabelsAtom } from "@features/workbench/client/tabLabels";
import { useSelector } from "@tanstack/react-store";
import { cn } from "@/utils";
import { Command, Lock, Trash2 } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

const CHAR_WIDTH_PX = 8;

type TabButtonProps = {
  tabId: string;
  index: number;
  disableClick: boolean;
  onContextMenu?: (event: React.MouseEvent, tabId: string) => void;
  onDragStart: (
    event: React.DragEvent<HTMLButtonElement>,
    tabId: string,
  ) => void;
  onDragOver: (
    event: React.DragEvent<HTMLButtonElement>,
    tabId: string,
  ) => void;
  onDragLeave?: (
    event: React.DragEvent<HTMLButtonElement>,
    tabId: string,
  ) => void;
  onDrop: (event: React.DragEvent<Element>) => void;
  onDragEnd: () => void;
  /** The pointer came onto the tab. */
  onHover?: (tabId: string, element: HTMLButtonElement) => void;
};

export function TabButton({
  tabId,
  index,
  disableClick,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onHover,
}: TabButtonProps) {
  // Selected here rather than passed down, so that a tab's button re-renders
  // only when its own label changes
  const tab = useSelector(tabLabelsAtom, (tabs) =>
    tabs.find((candidate) => candidate.id === tabId),
  );
  const showTabState = useSettings((s) => s.showTabState);
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Scroll active tab into view
  useEffect(() => {
    if (tab?.isActive && buttonRef.current) {
      buttonRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [tab?.isActive]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Only until the strip drops a closed tab's button
  if (!tab) {
    return null;
  }

  const showCloseButton = isHovered && !disableClick && !tab.locked;
  const progressState = showTabState ? tab.progressState : null;
  const showAgentIndicator = progressState !== null;
  const showIdleIndicator =
    showTabState &&
    !showAgentIndicator &&
    (tab.tabState === "idle-unseen" || tab.tabState === "idle-notified");
  const showRunningState =
    showTabState &&
    !tab.isActive &&
    !showAgentIndicator &&
    tab.tabState === "running";

  const handleDoubleClick = (event: React.MouseEvent) => {
    if (disableClick || isEditing || tab.locked) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setEditValue(tab.name || "");
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditValue("");
  };

  const handleSaveEdit = () => {
    const trimmedValue = editValue.trim();
    updateTabProperty(tabId, { name: trimmedValue || undefined });
    setIsEditing(false);
    setEditValue("");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      handleSaveEdit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      handleCancelEdit();
    }
  };

  const button = (
    <button
      ref={buttonRef}
      type="button"
      role="tab"
      aria-selected={tab.isActive}
      draggable={true}
      className={cn(
        "group flex items-center gap-2 py-1.5 px-3 border-0 rounded-lg cursor-pointer text-[0.85rem] leading-none transition-colors duration-150 flex-none whitespace-nowrap select-none",
        tab.isActive
          ? "bg-foreground/80 text-background"
          : "bg-secondary hover:bg-foreground/30",
      )}
      onClick={(event) => {
        if (disableClick) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        focusTab(tab.id);
      }}
      onMouseEnter={(event) => {
        setIsHovered(true);
        onHover?.(tab.id, event.currentTarget);
      }}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={
        onContextMenu ? (event) => onContextMenu(event, tab.id) : undefined
      }
      onDragStart={(event) => onDragStart(event, tab.id)}
      onDragOver={(event) => onDragOver(event, tab.id)}
      onDragLeave={
        onDragLeave ? (event) => onDragLeave(event, tab.id) : undefined
      }
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <span
        className="flex items-center gap-1.5 max-w-[150px] min-w-0"
        onDoubleClick={handleDoubleClick}
      >
        {tab.icon && !isEditing && <LabelIcon icon={tab.icon} />}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSaveEdit}
            className="bg-white/20 border-0 outline-none rounded px-1"
            style={{
              minWidth: "50px",
              maxWidth: "150px",
              width: `${Math.max(50, Math.min(150, editValue.length * CHAR_WIDTH_PX + 10))}px`,
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          />
        ) : showRunningState ? (
          <AnimatedShinyText className="overflow-hidden text-ellipsis whitespace-nowrap">
            {tab.label}
          </AnimatedShinyText>
        ) : (
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
            {tab.label}
          </span>
        )}
        {tab.sound && !isEditing && (
          <SoundButton
            sound={tab.sound}
            onMute={(muted) => {
              if (!disableClick) setTabMuted(tab.id, muted);
            }}
          />
        )}
      </span>

      <Separator
        orientation="vertical"
        className={cn(
          "h-4.5 ml-1 mr-0.5",
          tab.isActive ? "bg-background" : "bg-foreground/60",
        )}
      />

      {/* Tab index */}
      <span className="flex items-center gap-1 text-xs">
        {showCloseButton ? (
          <Trash2
            size={14}
            className="cursor-pointer transition-all duration-150 flex-none opacity-60 hover:opacity-100 hover:text-destructive"
            onClick={(event) => {
              event.stopPropagation();
              closeTab(tab.id);
            }}
          />
        ) : showAgentIndicator ? (
          <AgentIndicator progressState={progressState} />
        ) : showIdleIndicator ? (
          <IdleIndicator tabState={tab.tabState} />
        ) : tab.locked ? (
          <Lock size={14} className="flex-none opacity-60" />
        ) : (
          <Command size={14} className="flex-none opacity-60" />
        )}
        {index + 1}
      </span>
    </button>
  );

  // Non-active tabs include a hover preview of their contents, and so we don't want to wrap them in a tooltip.
  if (!tab.isActive) {
    return button;
  }

  return <PaneTooltip tooltip={tab.tooltip}>{button}</PaneTooltip>;
}

/**
 * The details of a pane, from `describePane`, shown on hover. A pane with no
 * details, like a canvas, gets no tooltip rather than an empty one.
 */
export function PaneTooltip({
  tooltip,
  side,
  align,
  children,
}: Pick<React.ComponentProps<typeof TooltipContent>, "side" | "align"> & {
  tooltip: Record<string, string>;
  children: React.ReactNode;
}) {
  if (Object.keys(tooltip).length === 0) {
    return children;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      {/* Breaks anywhere, since an address has no spaces to wrap at */}
      <TooltipContent
        side={side}
        align={align}
        className="max-w-[min(32rem,calc(100vw-2rem))] [overflow-wrap:anywhere]"
      >
        <div className="flex flex-col gap-1">
          {Object.entries(tooltip).map(([key, value]) => (
            <div key={key}>
              {key}: {value}
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
