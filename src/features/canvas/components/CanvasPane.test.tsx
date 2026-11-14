import { act, fireEvent, render } from "@testing-library/react";
import { Activity } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { CanvasPane } from "@features/canvas/components/CanvasPane";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  deleteCanvasState,
  getCanvasState,
} from "@features/canvas/client/canvasStore";

type Mode = "visible" | "hidden";

const paneId = "canvas-pane";

const renderInTab = () => {
  const tab = (mode: Mode) => (
    <TooltipProvider>
      <Activity mode={mode}>
        <CanvasPane
          pane={{ id: paneId, type: "canvas" }}
          paneId={paneId}
          onContextMenu={() => {}}
        />
      </Activity>
    </TooltipProvider>
  );
  const result = render(tab("visible"));
  const canvas = document.getElementById(`canvas-${paneId}`)!;
  const hideAndShow = () => {
    result.rerender(tab("hidden"));
    result.rerender(tab("visible"));
  };
  return {
    ...result,
    canvas,
    pane: result.container.firstElementChild!,
    hideAndShow,
  };
};

describe("CanvasPane", () => {
  afterEach(() => deleteCanvasState(paneId));

  it("drops a stroke in progress when its tab hides", () => {
    const { canvas, hideAndShow } = renderInTab();
    fireEvent.mouseDown(canvas, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(canvas, { clientX: 20, clientY: 20 });
    fireEvent.mouseMove(canvas, { clientX: 30, clientY: 30 });

    hideAndShow();
    fireEvent.mouseMove(canvas, { clientX: 200, clientY: 200 });
    fireEvent.mouseUp(canvas, { button: 0, clientX: 200, clientY: 200 });

    expect(getCanvasState(paneId).elements).toEqual([]);
  });

  it("ends a Space pan when its tab hides", () => {
    const { canvas, pane, hideAndShow } = renderInTab();
    fireEvent.keyDown(pane, { code: "Space", key: " " });
    fireEvent.mouseDown(canvas, { button: 0, clientX: 10, clientY: 10 });
    expect(canvas.style.cursor).toBe("grabbing");
    const viewport = getCanvasState(paneId).viewport;

    hideAndShow();
    fireEvent.mouseMove(canvas, { clientX: 200, clientY: 200 });

    expect(canvas.style.cursor).toBe("none");
    expect(getCanvasState(paneId).viewport).toEqual(viewport);
  });

  it("releases Space when focus leaves the canvas", () => {
    const { canvas, pane } = renderInTab();
    const elsewhere = document.body.appendChild(
      document.createElement("input"),
    );
    act(() => (pane as HTMLElement).focus());
    fireEvent.keyDown(pane, { code: "Space", key: " " });
    expect(canvas.style.cursor).toBe("grab");

    act(() => elsewhere.focus());

    expect(canvas.style.cursor).toBe("none");
    elsewhere.remove();
  });
});
