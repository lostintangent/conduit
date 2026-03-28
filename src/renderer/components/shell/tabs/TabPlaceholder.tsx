import React from "react";

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
