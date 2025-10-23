import React, { useState } from "react";
import { Command, X } from "lucide-react";
import { closeTab, focusTab } from "@/store/actions/tab";

const cx = (...classes: Array<string | false>) =>
  classes.filter(Boolean).join(" ");

type TabPlaceholderProps = {
  width: number | null;
  onDragOver: (event: React.DragEvent<Element>) => void;
  onDrop: (event: React.DragEvent<Element>) => void;
};

export const TabPlaceholder = ({
  width,
  onDragOver,
  onDrop,
}: TabPlaceholderProps) => (
  <div
    role="presentation"
    aria-hidden="true"
    className="flex items-center justify-center py-1.5 px-3 border border-dashed border-white/25 rounded-lg bg-white/10 opacity-60 transition-colors duration-150 flex-none"
    style={{
      width: `${width}px`,
    }}
    onDragOver={onDragOver}
    onDrop={onDrop}
  />
);

type TabButtonProps = {
  tabId: string;
  label: string;
  tooltip: string;
  index: number;
  isActive: boolean;
  disableClick: boolean;
  onContextMenu?: (event: React.MouseEvent, tabId: string) => void;
  onDragStart: (
    event: React.DragEvent<HTMLButtonElement>,
    tabId: string
  ) => void;
  onDragOver: (
    event: React.DragEvent<HTMLButtonElement>,
    tabId: string
  ) => void;
  onDrop: (event: React.DragEvent<Element>) => void;
  onDragEnd: () => void;
};

export const TabButton = ({
  tabId,
  label,
  tooltip,
  index,
  isActive,
  disableClick,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: TabButtonProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const showCloseButton = isHovered && !disableClick;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      draggable={true}
      className={cx(
        "group flex items-center gap-2 py-1.5 px-3 border-0 rounded-lg cursor-pointer text-[0.85rem] leading-none transition-colors duration-150 flex-none whitespace-nowrap select-none",
        isActive
          ? "bg-gradient-to-br from-accent-start to-accent-end text-white"
          : "bg-white/5 text-inherit hover:bg-white/10"
      )}
      onClick={(event) => {
        if (disableClick) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        focusTab(tabId);
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={
        onContextMenu ? (event) => onContextMenu(event, tabId) : undefined
      }
      onDragStart={(event) => onDragStart(event, tabId)}
      onDragOver={(event) => onDragOver(event, tabId)}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <span className="overflow-hidden text-ellipsis" title={tooltip}>
        {label}
      </span>
      <span className="text-white/40">|</span>
      <span className="flex items-center gap-1 text-xs">
        {showCloseButton ? (
          <X
            size={14}
            className="cursor-pointer transition-all duration-150 flex-none opacity-60 hover:opacity-100 hover:text-red-500"
            onClick={(event) => {
              event.stopPropagation();
              closeTab(tabId);
            }}
          />
        ) : (
          <Command size={14} className="flex-none opacity-60" />
        )}
        {index + 1}
      </span>
    </button>
  );
};
