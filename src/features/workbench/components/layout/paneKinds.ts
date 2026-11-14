import type { Pane, Tab } from "@features/workbench/model";
import type { ComponentType, MouseEvent } from "react";

/** What the layout gives every pane it hosts, whatever its kind. */
export type LayoutPaneProps<P extends Pane = Pane> = {
  pane: P;
  tab: Tab;
  isActive: boolean;
  isInPreview: boolean;
  isResizing: boolean;
  hideIndividualSandboxIndicator: boolean;
  onActivate: (event?: MouseEvent) => void;
  onContextMenu: (event: MouseEvent) => void;
  onHover: (isHovering: boolean) => void;
};

// Each kind of pane renders from its feature's `panes.tsx`, and a pane's
// type is that feature's folder name.
const kinds = import.meta.glob<ComponentType<LayoutPaneProps>>(
  "../../../*/panes.tsx",
  { eager: true, import: "default" },
);

export const getLayoutPane = (type: Pane["type"]) =>
  kinds[`../../../${type}/panes.tsx`];
