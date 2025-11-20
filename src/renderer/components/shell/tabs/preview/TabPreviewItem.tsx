import {
  calculatePreviewDimensions,
  PREVIEW_SCALE,
} from "@/utils/preview-scaling";
import { useEffect, useRef } from "react";

type TabPreviewItemProps = {
  tabId: string;
  onRefSet: (tabId: string, element: HTMLDivElement | null) => void;
  onClick?: (tabId: string) => void;
  scale?: number;
  isHovered?: boolean;
};

/**
 * Shared component for rendering a single tab preview
 * Used by both TabPreview (overlay) and TabsOverview (dialog)
 */
export function TabPreviewItem({
  tabId,
  onRefSet,
  onClick,
  scale = PREVIEW_SCALE,
  isHovered = false,
}: TabPreviewItemProps) {
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      // Clean up ref when unmounting
      onRefSet(tabId, null);
    };
  }, [tabId, onRefSet]);

  const handleRefSet = (el: HTMLDivElement | null) => {
    if (el && isMountedRef.current) {
      onRefSet(tabId, el);
    }
  };

  const handleClick = () => {
    if (onClick) {
      onClick(tabId);
    }
  };

  // Calculate the actual display size based on scale
  const { displayWidth, displayHeight, contentWidth, contentHeight } =
    calculatePreviewDimensions(scale);

  const borderClass = isHovered ? "border-accent shadow-lg" : "border-border";

  const interactivityClass = onClick
    ? "cursor-pointer hover:border-accent transition-colors pointer-events-auto"
    : "pointer-events-none";

  return (
    <div
      className={`flex overflow-hidden rounded border ${borderClass} ${interactivityClass}`}
      style={{
        width: displayWidth,
        height: displayHeight,
      }}
      onClick={handleClick}
    >
      <div
        className="flex pointer-events-none bg-pane-divider"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: contentWidth,
          height: contentHeight,
        }}
      >
        <div
          ref={handleRefSet}
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
