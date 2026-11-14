import { fireEvent, render } from "@testing-library/react";
import { Activity } from "react";
import { describe, expect, it } from "vitest";

import { AgentPanel } from "./AgentPanel";

type Mode = "visible" | "hidden";

describe("AgentPanel", () => {
  it("ends a drag when its tab hides", () => {
    const tab = (mode: Mode) => (
      <Activity mode={mode}>
        <AgentPanel
          isOpen
          isProcessing={false}
          onClose={() => {}}
          onSubmit={() => {}}
          content=""
        />
      </Activity>
    );
    const { container, rerender } = render(tab("visible"));
    const panel = container.firstElementChild as HTMLElement;
    const header = panel.firstElementChild as HTMLElement;
    fireEvent.mouseDown(header, { clientY: 500 });

    rerender(tab("hidden"));
    rerender(tab("visible"));
    fireEvent.mouseMove(document, { clientY: 200 });

    expect(panel.style.bottom).toBe("8px");
    expect(panel.style.top).toBe("");
  });
});
