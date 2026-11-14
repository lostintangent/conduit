import {
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { InputDialog } from "@/components/ui/input-dialog";
import { useFocusWhenActive } from "@/hooks/useFocusWhenActive";

describe("InputDialog", () => {
  it("saves the value without letting the form navigate the window", () => {
    const onSave = vi.fn();
    let submit: Event | undefined;
    const recordSubmit = (event: Event) => {
      submit = event;
    };
    window.addEventListener("submit", recordSubmit);

    try {
      render(
        <InputDialog
          isOpen
          initialValue="old"
          onClose={() => {}}
          onSave={onSave}
          title="Rename workspace"
          placeholder="Workspace name"
        />,
      );
      fireEvent.change(screen.getByPlaceholderText("Workspace name"), {
        target: { value: "new" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    } finally {
      window.removeEventListener("submit", recordSubmit);
    }

    expect(onSave).toHaveBeenCalledWith("new");
    expect(submit?.defaultPrevented).toBe(true);
  });

  it("hands focus back to the active pane when it closes", async () => {
    const pane = document.createElement("div");
    const paneInput = document.createElement("input");
    pane.append(paneInput);
    document.body.append(pane);
    const paneRef = { current: pane };
    renderHook(() =>
      useFocusWhenActive(true, paneRef, () => paneInput.focus()),
    );
    await waitFor(() => expect(document.activeElement).toBe(paneInput));

    const Harness = () => {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <InputDialog
          isOpen={isOpen}
          initialValue=""
          onClose={() => setIsOpen(false)}
          onSave={() => {}}
          title="Rename workspace"
          placeholder="Workspace name"
        />
      );
    };
    render(<Harness />);
    const dialogInput = screen.getByPlaceholderText("Workspace name");
    await waitFor(() => expect(document.activeElement).toBe(dialogInput));

    fireEvent.keyDown(dialogInput, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(paneInput));
    pane.remove();
  });
});
