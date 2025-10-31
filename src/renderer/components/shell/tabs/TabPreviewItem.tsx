import { useEffect, useRef } from "react";

export const PREVIEW_WIDTH = 320;
export const PREVIEW_HEIGHT = 200;
export const PREVIEW_SCALE = 0.35;

type TabPreviewItemProps = {
  tabId: string;
  onRefSet: (tabId: string, element: HTMLDivElement | null) => void;
  onClick?: (tabId: string) => void;
  clickable?: boolean;
  scale?: number;
};

/**
 * Shared component for rendering a single tab preview
 * Used by both TabPreview (overlay) and TabsOverview (dialog)
 */
export function TabPreviewItem({ tabId, onRefSet, onClick, clickable = false, scale = PREVIEW_SCALE }: TabPreviewItemProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Clean up ref when unmounting
      onRefSet(tabId, null);
    };
  }, [tabId, onRefSet]);

  useEffect(() => {
    if (containerRef.current && isMountedRef.current) {
      onRefSet(tabId, containerRef.current);
    }
  }, [tabId, onRefSet]);

  const handleClick = () => {
    if (clickable && onClick) {
      onClick(tabId);
    }
  };

  // Calculate the actual display size based on scale
  const displayWidth = PREVIEW_WIDTH * (scale / PREVIEW_SCALE);
  const displayHeight = PREVIEW_HEIGHT * (scale / PREVIEW_SCALE);

  return (
    <div
      className={`flex overflow-hidden rounded border border-white/[0.08] ${
        clickable ? 'cursor-pointer hover:border-white/[0.24] transition-colors pointer-events-auto' : 'pointer-events-none'
      }`}
      style={{
        width: displayWidth,
        height: displayHeight,
      }}
      onClick={handleClick}
    >
      <div
        className="pointer-events-none flex"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: PREVIEW_WIDTH / scale,
          height: PREVIEW_HEIGHT / scale,
        }}
      >
        <div
          ref={(el) => {
            containerRef.current = el;
          }}
          className="pointer-events-none flex w-full h-full min-h-0 min-w-0"
          style={{
            width: PREVIEW_WIDTH / scale,
            height: PREVIEW_HEIGHT / scale,
          }}
        />
      </div>
    </div>
  );
}
