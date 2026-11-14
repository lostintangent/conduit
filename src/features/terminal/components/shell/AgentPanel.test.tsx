import { fireEvent, render } from "@testing-library/react";
import { Activity } from "react";
import { describe, expect, it } from "vitest";

import { AgentPanel } from "./AgentPanel";

type Mode = "visible" | "hidden";

const agentPanel = (isOpen: boolean, mode: Mode = "visible") => (
  <>
    <button>Elsewhere</button>
    <Activity mode={mode}>
      <AgentPanel
        isOpen={isOpen}
        isProcessing={false}
        onClose={() => {}}
        onSubmit={() => {}}
        content=""
      />
    </Activity>
  </>
);

describe("AgentPanel", () => {
  it("clears and focuses its prompt each time it opens", () => {
    const { getByRole, rerender } = render(agentPanel(true));
    const input = getByRole("textbox") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "half typed" } });

    rerender(agentPanel(false));
    rerender(agentPanel(true));

    const reopened = getByRole("textbox") as HTMLInputElement;
    expect(reopened.value).toBe("");
    expect(document.activeElement).toBe(reopened);
  });

  it("keeps its draft and leaves focus alone when its tab shows again", () => {
    const { getByRole, rerender } = render(agentPanel(true));
    const input = getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "half typed" } });
    const elsewhere = getByRole("button", { name: "Elsewhere" });
    elsewhere.focus();

    rerender(agentPanel(true, "hidden"));
    rerender(agentPanel(true));

    expect(input.value).toBe("half typed");
    expect(document.activeElement).toBe(elsewhere);
  });

  it("ends a drag when its tab hides", () => {
    const { container, rerender } = render(agentPanel(true));
    const panel = container.lastElementChild as HTMLElement;
    const header = panel.firstElementChild as HTMLElement;
    fireEvent.mouseDown(header, { clientY: 500 });

    rerender(agentPanel(true, "hidden"));
    rerender(agentPanel(true));
    fireEvent.mouseMove(document, { clientY: 200 });

    expect(panel.style.bottom).toBe("8px");
    expect(panel.style.top).toBe("");
  });
});
