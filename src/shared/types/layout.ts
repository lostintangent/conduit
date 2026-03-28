export type Identifiable = { id: string };
type Resizable = { size?: number };

export type LayoutPaneNode = {
  type: "pane";
  paneId: string;
  collapsed?: boolean;
} & Identifiable &
  Resizable;

export type SplitDirection = "row" | "column";

export type LayoutSplitNode = {
  type: "split";
  direction: SplitDirection;
  children: LayoutNode[];
} & Identifiable &
  Resizable;

export type LayoutNode = LayoutPaneNode | LayoutSplitNode;
