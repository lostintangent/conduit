/**
 * @vitest-environment jsdom
 */

import type { Workspace, WorkspaceState } from "@shared/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";

const { workspaceApi } = vi.hoisted(() => {
  const workspaceApi = {
    getState: vi.fn<() => Promise<WorkspaceState>>(),
    deleteWorkspace: vi.fn<(name: string) => Promise<void>>(),
  };
  (globalThis as any).window.conduit = { workspace: workspaceApi };
  return { workspaceApi };
});

import { WorkspacePicker } from "@/components/shell/palette/WorkspacePicker";
import { workspaceStateAtom } from "@/store/atoms";

const workspace = (name: string): Workspace => ({
  name,
  lastModified: Date.now(),
  tabs: [],
  activeTabId: "",
});

describe("WorkspacePicker", () => {
  it("removes a deleted workspace from the list", async () => {
    const alpha = workspace("Alpha");
    const beta = workspace("Beta");
    const store = createStore();
    store.set(workspaceStateAtom, { workspaces: [alpha, beta] });
    workspaceApi.getState.mockResolvedValue({ workspaces: [beta] });
    workspaceApi.deleteWorkspace.mockResolvedValue();

    render(
      <Provider store={store}>
        <WorkspacePicker isOpen onClose={() => {}} />
      </Provider>,
    );

    await screen.findByText("Alpha");
    fireEvent.click(screen.getAllByLabelText("Delete session")[0]);

    await waitFor(() =>
      expect(workspaceApi.deleteWorkspace).toHaveBeenCalledWith("Alpha"),
    );
    await waitFor(() => expect(screen.queryByText("Alpha")).toBeNull());
    expect(screen.getByText("Beta")).toBeTruthy();
  });
});
