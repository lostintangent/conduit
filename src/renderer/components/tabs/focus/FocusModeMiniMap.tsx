import type { LayoutNode } from "@/types";

type MiniMapNodeProps = {
  node: LayoutNode;
  activePaneId: string;
  onSelectPane: (paneId: string) => void;
};

function MiniMapNode({ node, activePaneId, onSelectPane }: MiniMapNodeProps) {
  if (node.type === "pane") {
    const isActive = node.paneId === activePaneId;

    const handleClick = () => {
      if (!isActive) {
        onSelectPane(node.paneId);
      }
    };

    return (
      <button
        type="button"
        onClick={handleClick}
        className={`flex-1 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/60 ${isActive
          ? "bg-sky-500 cursor-default"
          : "bg-white/25 hover:bg-white/40 cursor-pointer"
          } h-full`}
        aria-pressed={isActive}
        aria-label={isActive ? "Current pane" : "Switch to pane"}
        title={isActive ? "Current pane" : "Switch to pane"}
        disabled={isActive}
      />
    );
  }

  const directionClass = node.direction === "row" ? "flex-row" : "flex-col";

  return (
    <div className={`flex ${directionClass} flex-1`}>
      {node.children.map((child, index) => {
        const borderClass =
          node.direction === "row"
            ? index === 0
              ? ""
              : "border-l border-white/15"
            : index === 0
              ? ""
              : "border-t border-white/15";

        return (
          <div key={child.id} className={`flex-1 flex ${borderClass}`}>
            <MiniMapNode
              node={child}
              activePaneId={activePaneId}
              onSelectPane={onSelectPane}
            />
          </div>
        );
      })}
    </div>
  );
}

type FocusModeMiniMapProps = {
  layout: LayoutNode;
  activePaneId: string;
  onSelectPane: (paneId: string) => void;
};

export function FocusModeMiniMap({
  layout,
  activePaneId,
  onSelectPane,
}: FocusModeMiniMapProps) {
  return (
    <div className="flex h-16 w-16 items-stretch rounded-md bg-black/60 p-1.5 shadow-lg backdrop-blur-[2px]">
      <MiniMapNode
        node={layout}
        activePaneId={activePaneId}
        onSelectPane={onSelectPane}
      />
    </div>
  );
}
