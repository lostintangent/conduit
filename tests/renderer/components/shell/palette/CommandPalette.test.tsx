import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "@/components/shell/palette/CommandPalette";

/** Types like a keyboard does, into whatever has focus and at its caret */
function type(text: string) {
  const input = document.activeElement as HTMLInputElement;
  for (const char of text) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    fireEvent.change(input, {
      target: {
        value: input.value.slice(0, start) + char + input.value.slice(end),
      },
    });
    input.setSelectionRange(start + 1, start + 1);
  }
}

function renderPalette(initialValue: string) {
  const props = {
    open: true,
    cwd: "",
    onOpenChange: vi.fn(),
    onSelectFile: vi.fn(),
    commands: [],
  };
  const view = render(
    <CommandPalette {...props} initialValue={initialValue} />,
  );
  return {
    input: screen.getByRole("textbox") as HTMLInputElement,
    reopenWith: (value: string) =>
      view.rerender(<CommandPalette {...props} initialValue={value} />),
  };
}

describe("CommandPalette", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps what's typed right after opening, in order, after the >", () => {
    const { input } = renderPalette(">");

    type("spl");
    act(() => vi.advanceTimersByTime(1000));
    type("it");

    expect(document.activeElement).toBe(input);
    expect(input.value).toBe(">split");
  });

  it("switches to commands when it's opened for them over quick open", () => {
    const { input, reopenWith } = renderPalette("");
    type("abc");

    reopenWith(">");
    type("x");

    expect(input.value).toBe(">x");
  });
});
