/**
 * Tests for the PanelResizer component.
 *
 * These tests verify the horizontal resize divider functionality.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Activity } from "react";
import { PanelResizer } from "@/components/panes/editor/components/FileTreePanel/PanelResizer";

// =============================================================================
// Tests
// =============================================================================

describe("PanelResizer", () => {
  describe("mouse interactions", () => {
    it("should call onResizeStart when mousedown on handle", () => {
      const onResizeStart = vi.fn();
      render(<PanelResizer onResize={vi.fn()} onResizeStart={onResizeStart} />);

      const handle = screen.getByTestId("panel-resizer").lastElementChild!;

      fireEvent.mouseDown(handle);

      expect(onResizeStart).toHaveBeenCalledTimes(1);
    });

    it("reports clamped heights while dragging and stops after mouseup", () => {
      const onResize = vi.fn();
      const onResizeEnd = vi.fn();
      render(
        <div data-testid="file-tree-panel">
          <PanelResizer
            onResize={onResize}
            onResizeEnd={onResizeEnd}
            minHeight={100}
            maxHeight={600}
          />
        </div>,
      );
      screen.getByTestId("file-tree-panel").getBoundingClientRect = () =>
        ({ bottom: 1000 }) as DOMRect;
      const handle = screen.getByTestId("panel-resizer").lastElementChild!;

      fireEvent.mouseDown(handle);
      fireEvent.mouseMove(document, { clientY: 700 });
      fireEvent.mouseMove(document, { clientY: 0 });
      fireEvent.mouseMove(document, { clientY: 950 });
      expect(onResize.mock.calls).toEqual([[300], [600], [100]]);

      fireEvent.mouseUp(document);
      expect(onResizeEnd).toHaveBeenCalledTimes(1);
      fireEvent.mouseMove(document, { clientY: 700 });
      expect(onResize).toHaveBeenCalledTimes(3);
    });

    it("ends a resize when its tab hides", () => {
      const onResize = vi.fn();
      const onResizeEnd = vi.fn();
      const tab = (mode: "visible" | "hidden") => (
        <Activity mode={mode}>
          <div data-testid="file-tree-panel">
            <PanelResizer onResize={onResize} onResizeEnd={onResizeEnd} />
          </div>
        </Activity>
      );
      const { rerender } = render(tab("visible"));
      fireEvent.mouseDown(
        screen.getByTestId("panel-resizer").lastElementChild!,
      );

      rerender(tab("hidden"));
      rerender(tab("visible"));
      fireEvent.mouseMove(document, { clientY: 700 });

      expect(onResizeEnd).toHaveBeenCalledTimes(1);
      expect(onResize).not.toHaveBeenCalled();
      expect(document.body.style.cursor).toBe("");
    });
  });
});
