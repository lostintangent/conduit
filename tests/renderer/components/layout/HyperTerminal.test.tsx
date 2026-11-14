import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@features/terminal/components/TerminalPane", () => ({
  TerminalPane: (): null => null,
}));

import { HyperTerminal } from "@/components/layout/quick/HyperTerminal";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useFocusWhenActive } from "@/hooks/useFocusWhenActive";

const pane = document.createElement("div");
const paneInput = document.createElement("input");
pane.append(paneInput);
const paneRef = { current: pane };

const ActivePane = (): null => {
  useFocusWhenActive(true, paneRef, () => paneInput.focus());
  return null;
};

const noop = () => {};

describe("HyperTerminal", () => {
  afterEach(() => pane.remove());

  it("gives focus back to the active pane when it goes away", async () => {
    document.body.append(pane);
    const { rerender } = render(
      <TooltipProvider>
        <ActivePane />
        <HyperTerminal
          terminal={{
            terminalId: "hyper-1",
            paneId: "hyper-pane-1",
            cwd: null,
            state: "visible",
            position: null,
          }}
          index={0}
          onClose={noop}
          onMinimize={noop}
          onMaximize={noop}
          onOpenAsTab={noop}
          onPositionChange={noop}
        />
      </TooltipProvider>,
    );
    await waitFor(() => expect(document.activeElement).toBe(paneInput));

    const minimize = screen.getByRole("button", { name: "Minimize" });
    act(() => minimize.focus());
    expect(document.activeElement).toBe(minimize);

    // Minimizing, closing or moving it unmounts it
    rerender(
      <TooltipProvider>
        <ActivePane />
      </TooltipProvider>,
    );
    await waitFor(() => expect(document.activeElement).toBe(paneInput));
  });
});
