import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/panes/editor/EditorPaneV2", () => ({
  EditorPaneV2: ({ pane }: { pane: { id: string } }) => {
    if (pane.id === "broken") {
      throw new Error("Editor broke");
    }
    return <div data-testid={`editor-${pane.id}`} />;
  },
}));

import { GlobalEditorContainer } from "@/components/panes/editor/components/GlobalEditorContainer";
import { EditorPaneRegistry } from "@/components/panes/editor/registry/EditorPaneRegistry";

describe("GlobalEditorContainer", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    EditorPaneRegistry.resetInstance();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    EditorPaneRegistry.resetInstance();
  });

  it("keeps the other editors when one throws, and closes the one that did", () => {
    const onClose = vi.fn();
    render(<GlobalEditorContainer />);
    const registry = EditorPaneRegistry.getInstance();

    act(() => {
      for (const id of ["working", "broken"]) {
        registry.getOrCreate(id, {
          pane: { id, type: "editor", cwd: "/repo" },
          onClose: id === "broken" ? onClose : undefined,
        });
      }
    });

    expect(screen.getByTestId("editor-working")).not.toBeNull();
    expect(screen.getByText("Editor broke")).not.toBeNull();
    act(() => screen.getByText("Close").click());
    expect(onClose).toHaveBeenCalledOnce();
  });
});
