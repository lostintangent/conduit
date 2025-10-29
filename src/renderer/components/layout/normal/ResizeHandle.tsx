import type { ComponentPropsWithoutRef } from "react";
import type { SplitDirection } from "@/types";

type ResizeHandleProps = ComponentPropsWithoutRef<"div"> & {
  direction: SplitDirection;
  highlightClass: string;
};

export function ResizeHandle({
  direction,
  highlightClass,
  className,
  style,
  ...divProps
}: ResizeHandleProps) {
  const baseClass =
    direction === "row"
      ? "absolute left-0 top-0 w-1 h-full z-10 cursor-col-resize transition-colors"
      : "absolute left-0 top-0 h-1 w-full z-10 cursor-row-resize transition-colors";

  const mergedClassName = `${baseClass} ${highlightClass}${
    className ? ` ${className}` : ""
  }`;

  return (
    <div
      className={mergedClassName}
      style={style}
      {...divProps}
    />
  );
}
