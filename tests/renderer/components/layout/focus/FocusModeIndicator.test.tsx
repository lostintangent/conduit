import { act, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { queryClient } from "@/query";
import { FocusModeIndicator } from "@/components/layout/focus/FocusModeIndicator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { activeTabIdAtom, tabsAtom } from "@/store/atoms";
import { render, seedSettings } from "../../../queryRender";
import type { Tab } from "@/types";

function tab(id: string): Tab {
  return {
    id,
    name: id,
    panes: {
      [`${id}-pane`]: {
        id: `${id}-pane`,
        type: "terminal",
        sessionId: `${id}-session`,
        cwd: "/repo",
        title: "zsh",
      },
    },
    layout: { id: `${id}-node`, type: "pane", paneId: `${id}-pane` },
    activePaneId: `${id}-pane`,
  };
}

describe("FocusModeIndicator", () => {
  // Tab labels read the home directory outside React
  beforeAll(() => seedSettings(queryClient));

  it("shows the active tab once there is one", () => {
    tabsAtom.set([]);
    activeTabIdAtom.set(null);
    render(
      <TooltipProvider>
        <FocusModeIndicator />
      </TooltipProvider>,
    );
    expect(screen.queryByRole("status")).toBeNull();

    act(() => {
      tabsAtom.set([tab("one"), tab("two")]);
      activeTabIdAtom.set("two");
    });

    expect(screen.getByRole("status").textContent).toContain("2/2");
    expect(
      screen.getByRole("button", { name: "Next tab" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
