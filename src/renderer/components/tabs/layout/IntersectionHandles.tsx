import type { LayoutResizeAxis } from "@/hooks/useLayoutResizing";
import type { SplitDirection } from "@/types";
import type React from "react";

export type IntersectionHandleData = {
  key: string;
  position: number;
  axisKeys: string[];
  axes: LayoutResizeAxis[];
};

type IntersectionHandlesProps = {
  direction: SplitDirection;
  handles: IntersectionHandleData[];
  baseHighlightKeys: string[];
  onHandleMouseDown: (
    event: React.MouseEvent<HTMLDivElement>,
    handle: IntersectionHandleData,
    highlightKeys: string[]
  ) => void;
  onHandleMouseEnter: (
    handle: IntersectionHandleData,
    highlightKeys: string[]
  ) => void;
  onHandleMouseLeave: () => void;
};

const buildHighlightKeys = (
  baseHighlightKeys: string[],
  handle: IntersectionHandleData
) =>
  Array.from(
    new Set([...baseHighlightKeys, ...handle.axisKeys])
  );

export function IntersectionHandles({
  direction,
  handles,
  baseHighlightKeys,
  onHandleMouseDown,
  onHandleMouseEnter,
  onHandleMouseLeave,
}: IntersectionHandlesProps) {
  if (handles.length === 0) {
    return null;
  }

  const cursorClass =
    direction === "row" ? "cursor-nwse-resize" : "cursor-nesw-resize";

  return (
    <>
      {handles.map((handle) => {
        const highlightKeys = buildHighlightKeys(baseHighlightKeys, handle);
        const baseStyle =
          direction === "row"
            ? { left: 0, top: `${handle.position * 100}%` }
            : { top: 0, left: `${handle.position * 100}%` };

        return (
          <div
            key={handle.key}
            className={`absolute z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 transform ${cursorClass}`}
            style={baseStyle}
            onMouseDown={(e) => {
              e.stopPropagation();
              onHandleMouseDown(e, handle, highlightKeys);
            }}
            onMouseEnter={() => {
              onHandleMouseEnter(handle, highlightKeys);
            }}
            onMouseLeave={onHandleMouseLeave}
          />
        );
      })}
    </>
  );
}
