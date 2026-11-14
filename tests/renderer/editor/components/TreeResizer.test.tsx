import { fireEvent, render, screen } from "@testing-library/react";
import { Activity } from "react";
import { describe, expect, it, vi } from "vitest";

import { TreeResizer } from "@/components/panes/editor/components/TreeResizer";

type Mode = "visible" | "hidden";

describe("TreeResizer", () => {
  it("ends a resize when its tab hides", () => {
    const onResize = vi.fn();
    const onResizeEnd = vi.fn();
    const tab = (mode: Mode) => (
      <Activity mode={mode}>
        <div data-testid="editor-pane-v2">
          <TreeResizer
            currentWidth={250}
            onResize={onResize}
            onResizeEnd={onResizeEnd}
          />
        </div>
      </Activity>
    );
    const { rerender } = render(tab("visible"));
    fireEvent.mouseDown(screen.getByTestId("tree-resizer").lastElementChild!);

    rerender(tab("hidden"));
    rerender(tab("visible"));
    fireEvent.mouseMove(document, { clientX: 300 });

    expect(onResizeEnd).toHaveBeenCalledTimes(1);
    expect(onResize).not.toHaveBeenCalled();
    expect(document.body.style.cursor).toBe("");
  });
});
