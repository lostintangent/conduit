// @ts-nocheck
import { EditorView } from "@/components/shell/sidebar/views/EditorView";
import {
  clearCwdEditorFile,
  setCwdEditorFile,
  sidebarStateAtom,
} from "@/store/sidebarStore";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/panes/editor", () => ({
  EditorPaneAnchor: ({ pane }) => (
    <span data-testid="pane-file">{pane.file ?? "no-file"}</span>
  ),
}));

const CWD = "/project";

describe("EditorView", () => {
  afterEach(() => {
    clearCwdEditorFile(CWD);
    sidebarStateAtom.set((prev) => ({ ...prev, navigation: undefined }));
  });

  it("opens the file a navigation request asks for", async () => {
    setCwdEditorFile(CWD, "/project/a.ts");
    render(<EditorView cwd={CWD} />);
    expect(screen.getByTestId("pane-file").textContent).toBe("/project/a.ts");

    await act(async () => {
      sidebarStateAtom.set((prev) => ({
        ...prev,
        navigation: { editorFile: "/project/b.md" },
      }));
    });

    expect(screen.getByTestId("pane-file").textContent).toBe("/project/b.md");
  });
});
