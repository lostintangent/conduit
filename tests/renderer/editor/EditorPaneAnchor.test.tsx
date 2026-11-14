import { EditorPaneAnchor } from "@/components/panes/editor/EditorPaneAnchor";
import { EditorPaneRegistry } from "@/components/panes/editor/registry/EditorPaneRegistry";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("EditorPaneAnchor focus on activation", () => {
  const pane = { id: "pane-1", type: "editor", cwd: "/repo" } as const;
  let frames: FrameRequestCallback[];
  let now: number;
  let tree: HTMLElement;
  let treeItem: HTMLElement;
  let editor: HTMLElement;
  let editorInput: HTMLElement;

  const flushFrame = () => frames.splice(0).forEach((frame) => frame(0));

  // Mounts an anchor the way a tab does, with stand-ins for the tree and
  // editor sides rendered into the pane's registry-owned wrapper
  const mountAnchor = () => {
    const view = render(
      <EditorPaneAnchor paneId="pane-1" pane={pane} isActive={false} />,
    );
    const registry = EditorPaneRegistry.getInstance();
    if (!registry.get("pane-1")!.isReady) {
      registry.getWrapperElement("pane-1")!.append(tree, editor);
      registry.markReady("pane-1");
    }

    return {
      // Focus is lost when the tab that had it is hidden
      activate: () => {
        (document.activeElement as HTMLElement | null)?.blur();
        view.rerender(
          <EditorPaneAnchor paneId="pane-1" pane={pane} isActive />,
        );
        flushFrame();
      },
      unmount: view.unmount,
    };
  };

  beforeEach(() => {
    EditorPaneRegistry.resetInstance();
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) =>
      frames.push(frame),
    );
    vi.stubGlobal("cancelAnimationFrame", () => {});
    now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    tree = document.createElement("div");
    tree.dataset.paneSide = "tree";
    tree.tabIndex = -1;
    tree.innerHTML =
      '<nav role="tree" tabindex="-1"><ul role="group"><li role="treeitem"><div tabindex="0">a.ts</div></li></ul></nav>';
    treeItem = tree.querySelector('[role="treeitem"] > div')!;

    editor = document.createElement("div");
    editor.innerHTML =
      '<div class="monaco-editor"><textarea class="inputarea"></textarea></div>';
    editorInput = editor.querySelector("textarea")!;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.replaceChildren();
    EditorPaneRegistry.resetInstance();
  });

  it("returns focus to where it last was after a tab switch remounts the anchor", () => {
    mountAnchor().unmount();
    treeItem.focus();

    mountAnchor().activate();
    expect(document.activeElement).toBe(treeItem);
  });

  it("focuses the editor when the side that last had focus is hidden", () => {
    const { activate } = mountAnchor();
    treeItem.focus();
    tree.style.display = "none";

    activate();
    expect(document.activeElement).toBe(editorInput);
  });

  it("focuses the tree when nothing here has had focus and there's no editor", () => {
    editor.style.display = "none";
    const { activate } = mountAnchor();

    activate();
    expect(document.activeElement).toBe(treeItem);
  });

  it("waits for a hidden editor that had focus before falling back to the tree", () => {
    const { activate } = mountAnchor();
    editorInput.focus();
    editor.style.display = "none";

    activate();
    expect(tree.contains(document.activeElement)).toBe(false);

    now = 1000;
    flushFrame();
    expect(document.activeElement).toBe(treeItem);
  });

  it("focuses the tree's side once the pane settles when it has no tab stop, like the changes view", () => {
    tree.innerHTML = "<nav><button>a.ts</button></nav>";
    const { activate } = mountAnchor();
    editorInput.focus();
    editor.style.display = "none";

    activate();
    expect(document.activeElement).toBe(document.body);

    now = 1000;
    flushFrame();
    expect(document.activeElement).toBe(tree);
  });
});
