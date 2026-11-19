import { useEffectEvent, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { TabPreviewItem } from "./TabPreviewItem";

/** Long enough for the pointer to cross from a tab to its preview. */
const CLOSE_DELAY_MS = 300;

type TabPreviewOverlayProps = {
  preview: {
    tabId: string;
    /** The tab's button, which the preview shows above */
    tab: HTMLElement;
    left: number;
    top: number;
  } | null;
  /** Called once the pointer has left both the tab and its preview. */
  onClose: () => void;
};

export function TabPreviewOverlay({
  preview,
  onClose,
}: TabPreviewOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const close = useEffectEvent(onClose);

  // Follows the pointer around the whole window, since the preview's own
  // enter and leave events miss some of it. Its panes are the tab's, moved in
  // from its panel, and its pages show over it rather than in it, so where the
  // pointer is says more than which element it's on.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!preview || !container) return;
    const { tab } = preview;

    let closing: ReturnType<typeof setTimeout> | undefined;
    const follow = (isOnTabOrPreview: boolean) => {
      if (isOnTabOrPreview) {
        clearTimeout(closing);
        closing = undefined;
      } else if (!closing) {
        closing = setTimeout(close, CLOSE_DELAY_MS);
      }
    };
    const isOnPreview = ({ clientX, clientY }: MouseEvent) => {
      const box = container.getBoundingClientRect();
      return (
        clientX >= box.left &&
        clientX < box.right &&
        clientY >= box.top &&
        clientY < box.bottom
      );
    };
    const handleOver = (event: MouseEvent) =>
      follow(tab.contains(event.target as Node) || isOnPreview(event));
    // The pointer is on nothing in the window once it leaves it
    const handleOut = (event: MouseEvent) => {
      if (!event.relatedTarget) follow(isOnPreview(event));
    };

    // It may have moved on before the preview showed
    follow(tab.matches(":hover") || container.matches(":hover"));
    document.addEventListener("mouseover", handleOver, true);
    document.addEventListener("mouseout", handleOut, true);
    return () => {
      document.removeEventListener("mouseover", handleOver, true);
      document.removeEventListener("mouseout", handleOut, true);
      clearTimeout(closing);
    };
  }, [preview]);

  if (!preview) return null;

  // Single tab preview mode - overlay wrapper with positioning
  return createPortal(
    <div
      ref={containerRef}
      className="pointer-events-auto fixed z-[85] bg-background shadow-xl backdrop-blur-sm hover:border-accent/50 hover:shadow-2xl cursor-pointer"
      style={{
        left: preview.left,
        top: preview.top,
        transform: "translate3d(0, calc(-106%), 0)",
      }}
    >
      <TabPreviewItem tabId={preview.tabId} />
    </div>,
    document.body,
  );
}
