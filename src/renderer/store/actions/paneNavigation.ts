import { activatePane } from "@/store/actions/pane";
import { paneFlashAtom, tabsAtom } from "@/store/atoms";
import type { LayoutNode } from "@/types";
import {
  getPaneDirectionConfig,
  walkLayout,
  type PaneDirection,
} from "@/utils/layout";
import { getDefaultStore } from "jotai";

export type PaneNavigationDirection = PaneDirection;

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PaneRect = {
  paneId: string;
  rect: Rect;
};

type Candidate = PaneRect & {
  centerX: number;
  centerY: number;
};

const store = getDefaultStore();
const CENTER_EPSILON = 1e-6;
const OVERLAP_EPSILON = 1e-6;

const collectPaneRects = (root: LayoutNode, panes: PaneRect[]) => {
  const nodeRects = new Map<string, Rect>();

  walkLayout(root, ({ node, parent, index }) => {
    let rect: Rect;

    if (!parent) {
      rect = { x: 0, y: 0, width: 1, height: 1 };
    } else {
      const parentRect = nodeRects.get(parent.id) ?? {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      };

      const siblings = parent.children;
      const sizes = siblings.map((sibling) => sibling.size ?? 1);
      const totalSize = sizes.reduce((sum, size) => sum + size, 0);
      const defaultSize =
        totalSize > 0 ? 0 : siblings.length > 0 ? 1 / siblings.length : 0;

      const weight =
        totalSize > 0 ? sizes[index] / totalSize : defaultSize || 0;
      const clampedWeight = Math.max(weight, 0);

      let offsetSum = 0;
      if (totalSize > 0) {
        for (let i = 0; i < index; i += 1) {
          offsetSum += sizes[i];
        }
      }

      const offsetWeight =
        totalSize > 0 ? offsetSum / totalSize : index * defaultSize;
      const clampedOffset = Math.max(offsetWeight, 0);

      if (parent.direction === "row") {
        rect = {
          x: parentRect.x + parentRect.width * clampedOffset,
          y: parentRect.y,
          width: parentRect.width * clampedWeight,
          height: parentRect.height,
        };
      } else {
        rect = {
          x: parentRect.x,
          y: parentRect.y + parentRect.height * clampedOffset,
          width: parentRect.width,
          height: parentRect.height * clampedWeight,
        };
      }
    }

    nodeRects.set(node.id, rect);
    if (node.type === "pane" && rect.width > 0 && rect.height > 0) {
      panes.push({ paneId: node.paneId, rect });
    }

    return true;
  });
};

const rangesOverlap = (
  startA: number,
  endA: number,
  startB: number,
  endB: number
) => Math.min(endA, endB) - Math.max(startA, startB) > OVERLAP_EPSILON;

const toCandidate = (pane: PaneRect): Candidate => ({
  ...pane,
  centerX: pane.rect.x + pane.rect.width / 2,
  centerY: pane.rect.y + pane.rect.height / 2,
});

const findNeighborPaneId = (
  panes: PaneRect[],
  activePaneId: string,
  direction: PaneNavigationDirection
): string | null => {
  const current = panes.find((pane) => pane.paneId === activePaneId);
  if (!current) {
    return null;
  }

  const { axis, isForward } = getPaneDirectionConfig(direction);
  const currentCenterX = current.rect.x + current.rect.width / 2;
  const currentCenterY = current.rect.y + current.rect.height / 2;

  const axisCandidates = panes
    .filter((pane) => pane.paneId !== activePaneId)
    .filter((pane) => {
      if (axis === "horizontal") {
        return rangesOverlap(
          current.rect.y,
          current.rect.y + current.rect.height,
          pane.rect.y,
          pane.rect.y + pane.rect.height
        );
      }

      return rangesOverlap(
        current.rect.x,
        current.rect.x + current.rect.width,
        pane.rect.x,
        pane.rect.x + pane.rect.width
      );
    })
    .map(toCandidate);

  if (axisCandidates.length === 0) {
    return null;
  }

  const axisKey = axis === "horizontal" ? "centerX" : "centerY";
  const perpKey = axis === "horizontal" ? "centerY" : "centerX";
  const currentAxis = axis === "horizontal" ? currentCenterX : currentCenterY;
  const currentPerpendicular =
    axis === "horizontal" ? currentCenterY : currentCenterX;

  const forwardCandidates = axisCandidates.filter((candidate) => {
    const diff = candidate[axisKey] - currentAxis;
    return isForward ? diff > CENTER_EPSILON : diff < -CENTER_EPSILON;
  });

  const compareCandidates = (a: Candidate, b: Candidate, wrap = false) => {
    const primaryDiffA = Math.abs(a[axisKey] - currentAxis);
    const primaryDiffB = Math.abs(b[axisKey] - currentAxis);
    if (!wrap && primaryDiffA !== primaryDiffB) {
      return primaryDiffA - primaryDiffB;
    }

    const perpDiffA = Math.abs(a[perpKey] - currentPerpendicular);
    const perpDiffB = Math.abs(b[perpKey] - currentPerpendicular);
    if (perpDiffA !== perpDiffB) {
      return perpDiffA - perpDiffB;
    }

    return isForward ? a[axisKey] - b[axisKey] : b[axisKey] - a[axisKey];
  };

  if (forwardCandidates.length > 0) {
    forwardCandidates.sort((a, b) => compareCandidates(a, b));
    return forwardCandidates[0].paneId;
  }

  const wrapExtremum = isForward
    ? Math.min(...axisCandidates.map((candidate) => candidate[axisKey]))
    : Math.max(...axisCandidates.map((candidate) => candidate[axisKey]));

  const wrapOptions = axisCandidates.filter(
    (candidate) =>
      Math.abs(candidate[axisKey] - wrapExtremum) <= CENTER_EPSILON ||
      (isForward
        ? candidate[axisKey] === wrapExtremum
        : candidate[axisKey] === wrapExtremum)
  );

  wrapOptions.sort((a, b) => compareCandidates(a, b, true));
  return wrapOptions.length > 0 ? wrapOptions[0].paneId : null;
};

/**
 * Check if there is a neighbor pane in the specified direction.
 * This is used to determine if move buttons should be shown.
 */
export const hasNeighborPane = (
  layout: LayoutNode,
  paneId: string,
  direction: PaneNavigationDirection
): boolean => {
  const paneRects: PaneRect[] = [];
  collectPaneRects(layout, paneRects);

  if (paneRects.length <= 1) {
    return false;
  }

  const targetPaneId = findNeighborPaneId(paneRects, paneId, direction);
  return targetPaneId !== null;
};

export const navigatePane = (
  tabId: string,
  paneId: string,
  direction: PaneNavigationDirection
): boolean => {
  const tabs = store.get(tabsAtom);
  const tab = tabs.find((entry) => entry.id === tabId);
  if (!tab) {
    return false;
  }

  if (!tab.panes[paneId]) {
    return false;
  }

  const paneRects: PaneRect[] = [];
  collectPaneRects(tab.layout, paneRects);

  if (paneRects.length <= 1) {
    return false;
  }

  const targetPaneId = findNeighborPaneId(paneRects, paneId, direction);
  if (!targetPaneId) {
    return false;
  }

  // Flash origin pane once
  store.set(paneFlashAtom, {
    paneId,
    type: "origin",
    timestamp: Date.now(),
  });

  // Flash target pane twice after a short delay
  setTimeout(() => {
    store.set(paneFlashAtom, {
      paneId: targetPaneId,
      type: "target",
      timestamp: Date.now(),
    });
  }, 150);

  activatePane(tabId, targetPaneId);
  return true;
};
