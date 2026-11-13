/**
 * @vitest-environment jsdom
 */

import type { Workspace, WorkspaceState } from "@shared/types";
import { renderHook, waitFor } from "@testing-library/react";
import { Provider } from "jotai";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

const { getState } = vi.hoisted(() => {
  const getState = vi.fn<() => Promise<WorkspaceState>>();
  (globalThis as any).window.conduit = {
    workspace: { getState },
    onOpenWorkspaceRequest: () => () => {},
  };
  return { getState };
});

import { useWorkspaces } from "@/hooks/useWorkspaces";

function JotaiWrapper({ children }: { children: React.ReactNode }) {
  return <Provider>{children}</Provider>;
}

const lastWorkspace: Workspace = {
  name: "__last_workspace__",
  lastModified: 1,
  tabs: [],
  activeTabId: "",
};

describe("useWorkspaces", () => {
  it.each<[WorkspaceState, boolean]>([
    [{ workspaces: [], lastWorkspace }, true],
    [{ workspaces: [] }, false],
  ])("reports whether a last workspace exists (%#)", async (state, expected) => {
    getState.mockResolvedValue(state);

    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: JotaiWrapper,
    });

    await waitFor(() => expect(getState).toHaveBeenCalled());
    await waitFor(() => expect(result.current.hasLastWorkspace).toBe(expected));
  });
});
