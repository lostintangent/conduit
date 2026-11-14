import { CanvasPane } from "@features/canvas/components/CanvasPane";
import type { LayoutPaneProps } from "@features/workbench/components/layout/paneKinds";
import type { CanvasPane as CanvasPaneType } from "@features/workbench/model";

export default function CanvasLayoutPane({
  pane,
  tab,
  isActive,
  onActivate,
  onContextMenu,
}: LayoutPaneProps<CanvasPaneType>) {
  return (
    <div
      className="flex flex-1 w-full h-full min-h-0 min-w-0"
      onContextMenu={onContextMenu}
      onMouseDown={onActivate}
    >
      <CanvasPane
        pane={pane}
        paneId={pane.id}
        tabId={tab.id}
        isActive={isActive}
        onContextMenu={onContextMenu}
      />
    </div>
  );
}
