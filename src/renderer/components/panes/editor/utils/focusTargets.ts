// Monaco's text input (the left side of a diff editor is read-only)
const MONACO_INPUT_SELECTOR = [".native-edit-context", "textarea.inputarea"]
  .map(
    (input) => `.monaco-editor:not(.original-in-monaco-diff-editor) ${input}`,
  )
  .join(", ");

// The file tree's roving tab stop
const TREE_TAB_STOP_SELECTOR =
  '[role="tree"][tabindex="0"], [role="treeitem"] > [tabindex="0"]';

/** The first showing Monaco text input in the container */
export function findEditorInput(container: HTMLElement) {
  return findVisible(container, MONACO_INPUT_SELECTOR);
}

/** The showing tab stop of a file tree in the container */
export function findTreeTabStop(container: HTMLElement) {
  return findVisible(container, TREE_TAB_STOP_SELECTOR);
}

function findVisible(container: HTMLElement, selector: string) {
  return (
    [...container.querySelectorAll<HTMLElement>(selector)].find((element) =>
      element.checkVisibility(),
    ) ?? null
  );
}
