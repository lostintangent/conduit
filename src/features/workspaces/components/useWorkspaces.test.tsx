import type { Workspace, WorkspaceState } from "@shared/types";
import { waitFor } from "@testing-library/react";
import { renderHook } from "../../../../tests/renderer/queryRender";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getState } = vi.hoisted(() => {
  const getState = vi.fn<() => Promise<WorkspaceState>>();
  (globalThis as any).window.conduit = {
    workspaces: { getState },
    onOpenWorkspaceRequest: () => () => {},
  };
  return { getState };
});

import { useWorkspaces } from "@features/workspaces/components/useWorkspaces";
import { workspaceStateAtom } from "@/store/atoms";

const lastWorkspace: Workspace = {
  name: "__last_workspace__",
  lastModified: 1,
  tabs: [],
  activeTabId: "",
};

describe("useWorkspaces", () => {
  beforeEach(() => {
    workspaceStateAtom.set({ workspaces: [] });
  });

  it.each<[WorkspaceState, boolean]>([
    [{ workspaces: [], lastWorkspace }, true],
    [{ workspaces: [] }, false],
  ])(
    "reports whether a last workspace exists (%#)",
    async (state, expected) => {
      getState.mockResolvedValue(state);

      const { result } = renderHook(() => useWorkspaces());

      await waitFor(() => expect(getState).toHaveBeenCalled());
      await waitFor(() =>
        expect(result.current.hasLastWorkspace).toBe(expected),
      );
    },
  );
});
