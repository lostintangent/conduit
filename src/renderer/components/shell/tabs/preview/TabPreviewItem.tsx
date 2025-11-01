import { cn } from "@/utils";
import { useCallback } from "react";

export const PREVIEW_WIDTH = 320;
export const PREVIEW_HEIGHT = 200;
export const PREVIEW_SCALE = 0.35;

type TabPreviewItemProps = {
  tabId: string;
  onParentChange: (tabId: string, element: HTMLDivElement | null) => void;
  onClick?: (tabId: string) => void;
  scale?: number;
};

/**
 * Shared component for rendering a single tab preview
 * Used by both TabPreview (overlay) and TabsOverview (dialog)
 */
export function TabPreviewItem({
  tabId,
  onParentChange,
  onClick,
  scale = PREVIEW_SCALE,
}: TabPreviewItemProps) {
  const handleParentChange = useCallback(
    (el: HTMLDivElement | null) => {
      onParentChange(tabId, el);
    },
    [onParentChange, tabId]
  );

  const handleClick = useCallback(() => {
    onClick?.(tabId);
  }, [onClick, tabId]);

  // Calculate the actual display size based on scale
  const displayWidth = PREVIEW_WIDTH * (scale / PREVIEW_SCALE);
  const displayHeight = PREVIEW_HEIGHT * (scale / PREVIEW_SCALE);

  // The inner container should always be the same size (the actual content)
  // We scale it down using CSS transform to fit in the display size
  const contentWidth = PREVIEW_WIDTH / PREVIEW_SCALE;
  const contentHeight = PREVIEW_HEIGHT / PREVIEW_SCALE;

  return (
    <div
      className={cn(
        "flex overflow-hidden rounded border border-white/[0.08]",
        onClick
          ? "cursor-pointer hover:border-blueprint transition-colors pointer-events-auto"
          : "pointer-events-none"
      )}
      style={{
        width: displayWidth,
        height: displayHeight,
      }}
      onClick={handleClick}
    >
      <div
        className="flex pointer-events-none"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: contentWidth,
          height: contentHeight,
        }}
      >
        <div
          ref={handleParentChange}
          className="flex w-full h-full min-h-0 min-w-0 pointer-events-auto"
          style={{
            width: contentWidth,
            height: contentHeight,
          }}
        />
      </div>
    </div>
  );
}
