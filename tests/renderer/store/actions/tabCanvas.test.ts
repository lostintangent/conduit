import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (window as any).conduit = { terminal: { close: vi.fn() } };
});

import { closeTab, duplicateTab } from "@/store/actions/tab";
import { tabsAtom } from "@/store/atoms";
import {
  type CanvasState,
  DEFAULT_CANVAS_STATE,
  getCanvasState,
  setCanvasState,
} from "@/store/canvasStore";
import type { Tab } from "@/types";
import type { CanvasElement } from "@shared/types/canvas";
import { enableMapSet } from "immer";

enableMapSet();

const element = {
  id: "rect-1",
  type: "rectangle",
  x: 10,
  y: 20,
  width: 30,
  height: 40,
} as unknown as CanvasElement;

const canvasState: CanvasState = {
  backgroundColor: "#ffffff",
  elements: [element],
  selectedIds: ["rect-1"],
  viewport: { zoom: 2, panX: 5, panY: 6 },
  history: { undoStack: [{} as never], redoStack: [] },
  showDotGrid: false,
};

function canvasTab(id: string, paneId: string): Tab {
  return {
    id,
    name: id,
    panes: { [paneId]: { id: paneId, type: "canvas", title: "Sketch" } },
    layout: { id: `${id}-layout`, type: "pane", paneId },
    activePaneId: paneId,
  };
}

describe("canvas panes in tab actions", () => {
  beforeEach(() => {
    tabsAtom.set([
      canvasTab("tab-1", "canvas-1"),
      canvasTab("tab-2", "canvas-2"),
    ]);
    setCanvasState("canvas-1", canvasState);
  });

  it("closeTab discards the state of its canvas panes", () => {
    closeTab("tab-1");

    expect(getCanvasState("canvas-1").elements).toEqual([]);
  });

  it("duplicateTab copies canvas panes and their drawing", async () => {
    const result = await duplicateTab("tab-1");

    const copy = tabsAtom.get().find((tab) => tab.id === result?.tabId)!;
    const [pane] = Object.values(copy.panes);
    expect(pane).toMatchObject({ type: "canvas", title: "Sketch" });
    expect(copy.layout).toMatchObject({ type: "pane", paneId: pane.id });
    expect(copy.activePaneId).toBe(pane.id);

    const copied = getCanvasState(pane.id);
    expect(copied).toMatchObject({
      backgroundColor: "#ffffff",
      viewport: { zoom: 2, panX: 5, panY: 6 },
      showDotGrid: false,
      selectedIds: [],
      history: DEFAULT_CANVAS_STATE.history,
    });
    expect(copied.elements).toEqual([
      { ...element, id: expect.not.stringMatching(/^rect-1$/) },
    ]);
    expect(getCanvasState("canvas-1")).toEqual(canvasState);
  });
});
