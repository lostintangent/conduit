import { useEffect, useRef } from "react";

export const PREVIEW_WIDTH = 320;
export const PREVIEW_HEIGHT = 200;
export const PREVIEW_SCALE = 0.35;

type TabPreviewItemProps = {
  tabId: string;
  onRefSet: (tabId: string, element: HTMLDivElement | null) => void;
};

/**
 * Shared component for rendering a single tab preview
 * Used by both TabPreview (overlay) and TabsOverview (dialog)
 */
export function TabPreviewItem({ tabId, onRefSet }: TabPreviewItemProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (containerRef.current) {
      onRefSet(tabId, containerRef.current);
    }
  }, [tabId, onRefSet]);

  return (
    <div
      className="pointer-events-none flex overflow-hidden rounded border border-white/[0.08]"
      style={{
        width: PREVIEW_WIDTH,
        height: PREVIEW_HEIGHT,
      }}
    >
      <div
        className="pointer-events-none flex"
        style={{
          transform: `scale(${PREVIEW_SCALE})`,
          transformOrigin: "top left",
          width: PREVIEW_WIDTH / PREVIEW_SCALE,
          height: PREVIEW_HEIGHT / PREVIEW_SCALE,
        }}
      >
        <div
          ref={(el) => {
            containerRef.current = el;
            if (el) {
              onRefSet(tabId, el);
            }
          }}
          className="pointer-events-none flex w-full h-full min-h-0 min-w-0"
          style={{
            width: PREVIEW_WIDTH / PREVIEW_SCALE,
            height: PREVIEW_HEIGHT / PREVIEW_SCALE,
          }}
        />
      </div>
    </div>
  );
}
