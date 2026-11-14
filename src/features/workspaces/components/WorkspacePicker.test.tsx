import type { Workspace, WorkspaceState } from "@shared/types";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { createQueryClient } from "@/query";
import { render } from "../../../../tests/renderer/queryRender";
import { describe, expect, it, vi } from "vitest";

const { workspaceApi } = vi.hoisted(() => {
  const workspaceApi = {
    deleteWorkspace: vi.fn<(name: string) => Promise<WorkspaceState>>(),
  };
  (globalThis as any).window.conduit = { workspaces: workspaceApi };
  return { workspaceApi };
});

import { workspacesQuery } from "@features/workspaces/client/queries";
import { WorkspacePicker } from "@features/workspaces/components/WorkspacePicker";

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
    const queryClient = createQueryClient();
    queryClient.setQueryData(workspacesQuery.queryKey, {
      workspaces: [alpha, beta],
    });
    workspaceApi.deleteWorkspace.mockResolvedValue({ workspaces: [beta] });

    render(<WorkspacePicker isOpen onClose={() => {}} />, { queryClient });

    await screen.findByText("Alpha");
    fireEvent.click(screen.getAllByLabelText("Delete session")[0]);

    await waitFor(() =>
      expect(workspaceApi.deleteWorkspace).toHaveBeenCalledWith("Alpha"),
    );
    await waitFor(() => expect(screen.queryByText("Alpha")).toBeNull());
    expect(screen.getByText("Beta")).toBeTruthy();
  });
});
