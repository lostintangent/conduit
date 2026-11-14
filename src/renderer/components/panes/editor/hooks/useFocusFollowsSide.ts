import { useEffect, useRef, type RefObject } from "react";
import { findEditorInput, findTreeTabStop } from "../utils/focusTargets";

export type PaneSide = "tree" | "editor";

// Panes on the same repo can lose their files to one commit, so only the one
// that last had focus takes it back
let lastFocusedPane: object | null = null;

/** How long a side can take to settle, like an opened file's editor showing */
const SETTLE_MS = 1000;

/**
 * A single layout shows the tree or the editor, not both, and a split layout
 * can collapse its tree. When a side hides, focus on it would fall to the
 * body, so it moves to the side that's showing: back to where it last was in
 * the tree, or into the editor's text once the file has loaded. Focus on the
 * editor side follows what it shows the same way: into the new editor's text,
 * like when a commit turns a diff into the file's editor, or to the tree when
 * it empties, like when the commit takes the file. The side itself holds
 * focus until then, or when it has nothing else to focus (e.g. a Markdown
 * preview).
 *
 * Focus elsewhere is left alone, like in a terminal where a commit clears the
 * open file, or in another editor pane.
 *
 * @param side The only side showing, or null while both are
 * @param editorContent What the editor side shows, or null while it's empty
 */
export function useFocusFollowsSide(
  side: PaneSide | null,
  editorContent: string | null,
  treeRef: RefObject<HTMLElement | null>,
  editorRef: RefObject<HTMLElement | null>,
) {
  const pane = useRef({});
  const shown = useRef({ side, editorContent });
  const lastFocus = useRef<{
    side: PaneSide | null;
    inTree: HTMLElement | null;
  }>({ side: null, inTree: null });

  useEffect(() => {
    const tree = treeRef.current;
    const editor = editorRef.current;
    if (!tree || !editor) return;

    const onTreeFocus = (event: FocusEvent) => {
      lastFocusedPane = pane.current;
      lastFocus.current = { side: "tree", inTree: event.target as HTMLElement };
    };
    const onEditorFocus = () => {
      lastFocusedPane = pane.current;
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
    const previous = shown.current;
    shown.current = { side, editorContent };
    const focusedSide = lastFocus.current.side;
    if (!focusedSide || lastFocusedPane !== pane.current) return;
    const didSideHide =
      side !== previous.side && side !== null && side !== focusedSide;
    const didEditorChange =
      focusedSide === "editor" && editorContent !== previous.editorContent;
    if (!didSideHide && !didEditorChange) return;

    // The editor side while it has something to show, otherwise the tree
    const targetSide = side ?? (editorContent === null ? "tree" : "editor");
    const left = (focusedSide === "tree" ? treeRef : editorRef).current;
    const showing = (targetSide === "tree" ? treeRef : editorRef).current;
    if (!left || !showing) return;

    // Focus is held until the side settles, since what it lands on can still
    // go, like the editor of a diff that's closing
    const start = performance.now();
    let frame = 0;
    let placed: HTMLElement | null = null;
    const holdFocus = () => {
      // Stop once focus is anywhere other than where it was put, lost, held
      // by a side, or in what the side it left no longer shows
      const current = document.activeElement;
      const isPending =
        !current ||
        current === document.body ||
        current === showing ||
        current === left ||
        (left.contains(current) && (didSideHide || !current.checkVisibility()));
      if (!isPending && current !== placed) return;

      if (isPending) {
        const target =
          targetSide === "tree"
            ? findTreeReturn(showing, lastFocus.current.inTree)
            : findEditorInput(showing);
        placed = target ?? showing;
        placed.focus({ preventScroll: true });
      }
      if (performance.now() - start < SETTLE_MS) {
        frame = requestAnimationFrame(holdFocus);
      }
    };

    holdFocus();
    return () => cancelAnimationFrame(frame);
  }, [side, editorContent, treeRef, editorRef]);
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
