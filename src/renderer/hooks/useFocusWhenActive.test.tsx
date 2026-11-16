import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  focusActivePane,
  useFocusWhenActive,
} from "@/hooks/useFocusWhenActive";

const dialogs: HTMLElement[] = [];

function quickPane() {
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  dialog.dataset.quickPane = "";
  dialog.tabIndex = -1;
  const input = document.createElement("input");
  dialog.append(input);
  document.body.append(dialog);
  dialogs.push(dialog);
  return { dialog, input };
}

describe("useFocusWhenActive", () => {
  afterEach(() => {
    dialogs.splice(0).forEach((dialog) => dialog.remove());
  });

  it("takes focus from a quick pane that another one opened in front of", async () => {
    const behind = quickPane();
    behind.input.focus();
    const front = quickPane();
    const paneRef = { current: front.dialog };

    const ActivePane = (): null => {
      useFocusWhenActive(true, paneRef, () => front.input.focus());
      return null;
    };
    render(<ActivePane />);

    await waitFor(() => expect(document.activeElement).toBe(front.input));
  });

  // Its focus trap gives the dialog focus when what had it goes away, e.g.
  // when a file picked in Quick Open replaces it
  it("takes focus back from the dialog around its quick pane", async () => {
    const { dialog, input } = quickPane();
    const pane = document.createElement("div");
    pane.append(input);
    dialog.append(pane);
    const paneRef = { current: pane };

    const ActivePane = (): null => {
      useFocusWhenActive(true, paneRef, () => input.focus());
      return null;
    };
    render(<ActivePane />);
    await waitFor(() => expect(document.activeElement).toBe(input));

    dialog.focus();
    focusActivePane();

    await waitFor(() => expect(document.activeElement).toBe(input));
  });
});
