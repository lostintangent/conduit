import type { Workspace } from "@shared/types";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (globalThis as any).window.conduit = { workspaces: {} };
});
vi.mock("@features/workspaces/client/actions", () => ({
  openWorkspace: vi.fn(),
}));

import { openWorkspace } from "@features/workspaces/client/actions";
import { WorkspaceMenu } from "@features/workspaces/components/WorkspaceMenu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useFocusWhenActive } from "@/hooks/useFocusWhenActive";
import { workspaceNameAtom, workspaceStateAtom } from "@/store/atoms";

const workspace = (name: string): Workspace => ({
  name,
  lastModified: Date.now(),
  tabs: [],
  activeTabId: "",
});

const pane = document.createElement("div");
const paneInput = document.createElement("input");
pane.append(paneInput);
const paneRef = { current: pane };

const ActivePane = (): null => {
  useFocusWhenActive(true, paneRef, () => paneInput.focus());
  return null;
};

const openMenu = async () => {
  workspaceStateAtom.set({
    workspaces: [workspace("Alpha"), workspace("Beta")],
  });
  workspaceNameAtom.set("Alpha");
  document.body.append(pane);
  render(
    <TooltipProvider>
      <ActivePane />
      <WorkspaceMenu />
    </TooltipProvider>,
  );
  await waitFor(() => expect(document.activeElement).toBe(paneInput));

  const button = screen.getByRole("button", { name: "Workspaces" });
  act(() => button.focus());
  fireEvent.keyDown(button, { key: "Enter" });
  await screen.findByRole("menu");
  return button;
};

describe("WorkspaceMenu", () => {
  afterEach(() => pane.remove());

  it("hands focus to the active pane after choosing a workspace", async () => {
    await openMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: /Beta/ }));
    expect(openWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Beta" }),
    );
    await waitFor(() => expect(document.activeElement).toBe(paneInput));
  });

  it("returns focus to its button when dismissed", async () => {
    const button = await openMenu();

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(button));
  });
});
