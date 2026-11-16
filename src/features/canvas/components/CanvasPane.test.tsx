import { act, fireEvent, render } from "@testing-library/react";
import { Activity } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CanvasPane } from "@features/canvas/components/CanvasPane";
import { TooltipProvider } from "@/ui/tooltip";
import {
  deleteCanvasState,
  getCanvasState,
  setSelectedIds,
} from "@features/canvas/client/canvasStore";

type Mode = "visible" | "hidden";

const paneId = "canvas-pane";

const renderInTab = ({ quick = false } = {}) => {
  const tab = (mode: Mode) => (
    <TooltipProvider>
      <Activity mode={mode}>
        <div data-quick-pane={quick ? "" : undefined}>
          <CanvasPane
            pane={{ id: paneId, type: "canvas" }}
            paneId={paneId}
            onContextMenu={() => {}}
          />
        </div>
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
    pane: result.container.firstElementChild!.firstElementChild!,
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

  // A quick pane closes on an Escape that reaches it
  describe("keeps an Escape it uses from the pane around it", () => {
    const reached = vi.fn();
    afterEach(() => {
      document.body.removeEventListener("keydown", reached);
      reached.mockReset();
    });

    const drawStroke = (canvas: HTMLElement) => {
      fireEvent.mouseDown(canvas, { button: 0, clientX: 10, clientY: 10 });
      fireEvent.mouseMove(canvas, { clientX: 30, clientY: 30 });
      fireEvent.mouseUp(canvas, { button: 0, clientX: 30, clientY: 30 });
    };

    it("to clear the selection", () => {
      const { canvas, pane } = renderInTab();
      drawStroke(canvas);
      const [stroke] = getCanvasState(paneId).elements;
      act(() => setSelectedIds(paneId, [stroke.id]));
      document.body.addEventListener("keydown", reached);

      fireEvent.keyDown(pane, { key: "Escape" });
      expect(getCanvasState(paneId).selectedIds).toEqual([]);
      expect(reached).not.toHaveBeenCalled();

      fireEvent.keyDown(pane, { key: "Escape" });
      expect(reached).toHaveBeenCalledTimes(1);
    });

    it("to cancel the text it's adding", () => {
      const { canvas, pane } = renderInTab();
      // The tool buttons are named only by their tooltips
      fireEvent.click(pane.querySelector(".lucide-type")!.closest("button")!);
      fireEvent.mouseDown(canvas, { button: 0, clientX: 10, clientY: 10 });
      const input = pane.querySelector("input")!;
      document.body.addEventListener("keydown", reached);

      fireEvent.keyDown(input, { key: "Escape" });
      expect(pane.querySelector("input")).toBeNull();
      expect(reached).not.toHaveBeenCalled();

      fireEvent.keyDown(pane, { key: "Escape" });
      expect(reached).toHaveBeenCalledTimes(1);
    });

    // A quick canvas's drawing goes when it closes
    it("to keep a quick pane with a drawing open", () => {
      const { canvas, pane } = renderInTab({ quick: true });
      document.body.addEventListener("keydown", reached);
      fireEvent.keyDown(pane, { key: "Escape" });
      expect(reached).toHaveBeenCalledTimes(1);

      drawStroke(canvas);
      fireEvent.keyDown(pane, { key: "Escape" });
      fireEvent.keyDown(pane, { key: "Escape" });

      expect(reached).toHaveBeenCalledTimes(1);
      expect(getCanvasState(paneId).elements).toHaveLength(1);
    });
  });
});
