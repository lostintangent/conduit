import type { Workspace, WorkspaceState } from "@shared/types";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../../../tests/renderer/queryRender";
import { afterEach, describe, expect, it, vi } from "vitest";

const { workspaceApi } = vi.hoisted(() => {
  const workspaceApi = {
    getState: vi.fn<() => Promise<WorkspaceState>>(),
    importFromFile: vi.fn<() => Promise<Workspace | null>>(),
  };
  (globalThis as any).window.conduit = { workspaces: workspaceApi };
  return { workspaceApi };
});
vi.mock("@features/workspaces/client/actions", () => ({
  openWorkspace: vi.fn(),
}));

import { openWorkspace } from "@features/workspaces/client/actions";
import { workspacesQuery } from "@features/workspaces/client/queries";
import { WorkspaceMenu } from "@features/workspaces/components/WorkspaceMenu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useFocusWhenActive } from "@/hooks/useFocusWhenActive";
import { createQueryClient } from "@/query";
import { workspaceNameAtom } from "@/store/atoms";

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
  const queryClient = createQueryClient();
  queryClient.setQueryData(workspacesQuery.queryKey, {
    workspaces: [workspace("Alpha"), workspace("Beta")],
  });
  workspaceNameAtom.set("Alpha");
  document.body.append(pane);
  render(
    <TooltipProvider>
      <ActivePane />
      <WorkspaceMenu />
    </TooltipProvider>,
    { queryClient },
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

  it("lists and opens an imported workspace", async () => {
    await openMenu();
    const imported = workspace("Gamma");
    workspaceApi.importFromFile.mockResolvedValue(imported);
    workspaceApi.getState.mockResolvedValue({
      workspaces: [imported, workspace("Alpha"), workspace("Beta")],
    });

    fireEvent.click(
      screen.getByRole("menuitem", { name: "Import Workspace..." }),
    );

    await waitFor(() => expect(openWorkspace).toHaveBeenCalledWith(imported));
    fireEvent.keyDown(screen.getByRole("button", { name: "Workspaces" }), {
      key: "Enter",
    });
    expect(await screen.findByRole("menuitem", { name: /Gamma/ })).toBeTruthy();
  });

  it("returns focus to its button when dismissed", async () => {
    const button = await openMenu();

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(button));
  });
});
