import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFocusFollowsSide } from "../../../../src/renderer/components/panes/editor/hooks/useFocusFollowsSide";

/** A split pane, showing both sides, whose editor side shows a diff. */
function renderPane() {
  const tree = document.createElement("div");
  tree.innerHTML = '<ul role="tree" tabindex="0"></ul>';
  const editor = document.createElement("div");
  editor.innerHTML =
    '<div class="monaco-editor"><textarea class="inputarea"></textarea></div>';
  document.body.append(tree, editor);
  const hook = renderHook(
    ({ content }: { content: string | null }) =>
      useFocusFollowsSide(
        null,
        content,
        { current: tree },
        { current: editor },
      ),
    { initialProps: { content: "diff /repo/a.ts" } },
  );
  return {
    hook,
    treeTabStop: tree.querySelector("ul")!,
    input: editor.querySelector("textarea")!,
  };
}

describe("useFocusFollowsSide", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("moves focus to the tree of the pane that had it when one commit empties two", () => {
    const first = renderPane();
    const second = renderPane();
    first.input.focus();
    second.input.focus();

    // The commit takes both files, and both diffs with them
    first.input.remove();
    second.input.remove();
    first.hook.rerender({ content: null });
    expect(document.activeElement).toBe(document.body);
    second.hook.rerender({ content: null });
    expect(document.activeElement).toBe(second.treeTabStop);
  });

  it("leaves focus on a control the editor side still shows when what it shows changes", () => {
    const { hook, input } = renderPane();
    const toggle = document.createElement("button");
    input.closest(".monaco-editor")!.before(toggle);
    toggle.focus();

    hook.rerender({ content: "editor /repo/a.ts" });
    expect(document.activeElement).toBe(toggle);
  });
});
