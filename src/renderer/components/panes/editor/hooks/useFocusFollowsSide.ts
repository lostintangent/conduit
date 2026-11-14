import { useEffect, useRef, type RefObject } from "react";
import { findEditorInput, findTreeTabStop } from "../utils/focusTargets";

export type PaneSide = "tree" | "editor";

/** How long an opened file's editor can take to show */
const SETTLE_MS = 1000;

/**
 * A single layout shows the tree or the editor, not both, and a split layout
 * can collapse its tree. When a side hides, focus on it would fall to the
 * body, so it moves to the side that's showing: back to where it last was in
 * the tree, or into the editor's text once the file has loaded. The side
 * itself holds focus until then, or when it has nothing else to focus (e.g. a
 * Markdown preview).
 *
 * Focus that wasn't on the side that hid is left alone, like in a terminal
 * where a commit clears the open file.
 *
 * @param side The only side showing, or null while both are
 */
export function useFocusFollowsSide(
  side: PaneSide | null,
  treeRef: RefObject<HTMLElement | null>,
  editorRef: RefObject<HTMLElement | null>,
) {
  const shownSide = useRef(side);
  const lastFocus = useRef<{
    side: PaneSide | null;
    inTree: HTMLElement | null;
  }>({ side: null, inTree: null });

  useEffect(() => {
    const tree = treeRef.current;
    const editor = editorRef.current;
    if (!tree || !editor) return;

    const onTreeFocus = (event: FocusEvent) => {
      lastFocus.current = { side: "tree", inTree: event.target as HTMLElement };
    };
    const onEditorFocus = () => {
      lastFocus.current = { ...lastFocus.current, side: "editor" };
    };
    tree.addEventListener("focusin", onTreeFocus);
    editor.addEventListener("focusin", onEditorFocus);
    return () => {
      tree.removeEventListener("focusin", onTreeFocus);
      editor.removeEventListener("focusin", onEditorFocus);
    };
  }, [treeRef, editorRef]);

  useEffect(() => {
    const previousSide = shownSide.current;
    shownSide.current = side;
    if (!side || side === previousSide) return;
    const hiddenSide = side === "tree" ? "editor" : "tree";
    if (lastFocus.current.side !== hiddenSide) return;

    const hidden = (side === "tree" ? editorRef : treeRef).current;
    const showing = (side === "tree" ? treeRef : editorRef).current;
    if (!hidden || !showing) return;

    const start = performance.now();
    let frame = 0;
    const tryFocus = () => {
      // Stop once focus is anywhere other than lost or held by the side
      const current = document.activeElement;
      const isPending =
        !current ||
        current === document.body ||
        current === showing ||
        hidden.contains(current);
      if (!isPending) return;

      const target =
        side === "tree"
          ? findTreeReturn(showing, lastFocus.current.inTree)
          : findEditorInput(showing);
      (target ?? showing).focus({ preventScroll: true });

      if (!target && performance.now() - start < SETTLE_MS) {
        frame = requestAnimationFrame(tryFocus);
      }
    };

    tryFocus();
    return () => cancelAnimationFrame(frame);
  }, [side, treeRef, editorRef]);
}

// Where focus last was in the tree, or the nearest control around it that's
// showing, like a commit's row for the hover-only button that opened it
function findTreeReturn(tree: HTMLElement, lastFocused: HTMLElement | null) {
  for (
    let element = lastFocused;
    element && element !== tree && tree.contains(element);
    element = element.parentElement
  ) {
    const isFocusable = element === lastFocused || element.tabIndex >= 0;
    if (isFocusable && element.checkVisibility()) return element;
  }
  return findTreeTabStop(tree);
}
