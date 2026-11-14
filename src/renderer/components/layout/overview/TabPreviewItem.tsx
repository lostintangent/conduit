import { useTabContentPortal } from "@/components/layout/normal/TabContentPortalContext";
import { useSelector } from "@tanstack/react-store";
import { useCallback } from "react";

const HOVER_PREVIEW_SIZE = { width: 320, height: 200 };

type TabPreviewItemProps = {
  tabId: string;
  onClick?: (tabId: string) => void;
  /** The box the tab scales down to fit, keeping its shape */
  size?: { width: number; height: number };
  isHovered?: boolean;
};

/**
 * Shared component for rendering a single tab preview
 * Used by both TabPreview (overlay) and TabsOverview (dialog)
 */
export function TabPreviewItem({
  tabId,
  onClick,
  size = HOVER_PREVIEW_SIZE,
  isHovered = false,
}: TabPreviewItemProps) {
  const { previewTab, panelSize } = useTabContentPortal();
  // Shows the tab's content here for as long as the preview is mounted
  const contentRef = useCallback(
    (container: HTMLDivElement) => previewTab(tabId, container),
    [previewTab, tabId],
  );

  const handleClick = () => {
    if (onClick) {
      onClick(tabId);
    }
  };

  // Lays the tab out at its panel's size and scales it down, so its panes
  // look as they do in the tab, and don't change layout when it shows
  const content = useSelector(panelSize);
  const scale = Math.min(
    size.width / content.width,
    size.height / content.height,
  );

  const borderClass = isHovered
    ? "border-accent shadow-lg"
    : "border-pane-divider";

  const interactivityClass = onClick
    ? "cursor-pointer hover:border-accent transition-colors pointer-events-auto"
    : "pointer-events-none";

  return (
    <div
      className={`flex overflow-hidden rounded border ${borderClass} ${interactivityClass}`}
      style={{
        width: content.width * scale,
        height: content.height * scale,
      }}
      onClick={handleClick}
    >
      <div
        className="flex pointer-events-none bg-pane-divider"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: content.width,
          height: content.height,
        }}
      >
        <div
          ref={contentRef}
          className="flex w-full h-full min-h-0 min-w-0 pointer-events-auto"
          style={{
            width: content.width,
            height: content.height,
          }}
        />
      </div>
    </div>
  );
}
