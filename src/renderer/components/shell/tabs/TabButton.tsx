import { Separator } from "@/components/ui/separator";
import { closeTab, focusTab, updateTabProperty } from "@/store/actions/tab";
import { Command, Lock, Trash2 } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

const cx = (...classes: Array<string | false>) =>
  classes.filter(Boolean).join(" ");

const CHAR_WIDTH_PX = 8;

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
  title: string | undefined;
  index: number;
  isActive: boolean;
  disableClick: boolean;
  isLocked: boolean;
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
  onHoverChange?: (tabId: string, element: HTMLButtonElement | null) => void;
};

export const TabButton = ({
  tabId,
  label,
  tooltip,
  title,
  index,
  isActive,
  disableClick,
  isLocked,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onHoverChange,
}: TabButtonProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const showCloseButton = isHovered && !disableClick && !isLocked;

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = (event: React.MouseEvent) => {
    if (disableClick || isEditing || isLocked) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setEditValue(title || "");
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditValue("");
  };

  const handleSaveEdit = () => {
    const trimmedValue = editValue.trim();
    // Always update the title, even if empty (to clear it)
    updateTabProperty(tabId, { title: trimmedValue || undefined });
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

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      draggable={true}
      className={cx(
        "group flex items-center gap-2 py-1.5 px-3 border-0 rounded-lg cursor-pointer text-[0.85rem] leading-none transition-colors duration-150 flex-none whitespace-nowrap select-none",
        isActive ? "magic" : "bg-secondary hover:bg-secondary-hover",
      )}
      onClick={(event) => {
        if (disableClick) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        focusTab(tabId);
      }}
      onMouseEnter={(event) => {
        setIsHovered(true);
        onHoverChange?.(tabId, event.currentTarget);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        onHoverChange?.(tabId, null);
      }}
      onContextMenu={
        onContextMenu ? (event) => onContextMenu(event, tabId) : undefined
      }
      onDragStart={(event) => onDragStart(event, tabId)}
      onDragOver={(event) => onDragOver(event, tabId)}
      onDragLeave={
        onDragLeave ? (event) => onDragLeave(event, tabId) : undefined
      }
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <span
        className="overflow-hidden text-ellipsis max-w-[150px] flex items-center gap-1"
        title={tooltip}
        onDoubleClick={handleDoubleClick}
      >
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
        ) : (
          label
        )}
      </span>

      <Separator
        orientation="vertical"
        className="h-4.5 ml-1 mr-0.5 bg-foreground/60"
      />

      <span className="flex items-center gap-1 text-xs">
        {showCloseButton ? (
          <Trash2
            size={14}
            className="cursor-pointer transition-all duration-150 flex-none opacity-60 hover:opacity-100 hover:text-destructive"
            onClick={(event) => {
              event.stopPropagation();
              if (!isLocked) {
                closeTab(tabId);
              }
            }}
          />
        ) : isLocked ? (
          <Lock size={14} className="flex-none opacity-60" />
        ) : (
          <Command size={14} className="flex-none opacity-60" />
        )}
        {index + 1}
      </span>
    </button>
  );
};
