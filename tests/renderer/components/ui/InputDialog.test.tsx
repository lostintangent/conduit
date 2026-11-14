/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InputDialog } from "@/components/ui/input-dialog";

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
});
