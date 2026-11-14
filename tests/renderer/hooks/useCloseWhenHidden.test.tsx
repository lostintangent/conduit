import { fireEvent, render, screen } from "@testing-library/react";
import { Activity, useState } from "react";
import { describe, expect, it } from "vitest";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Mode = "visible" | "hidden";

describe("useCloseWhenHidden", () => {
  it("closes an open menu when its tab hides", () => {
    const tab = (mode: Mode) => (
      <Activity mode={mode}>
        <DropdownMenu>
          <DropdownMenuTrigger>Options</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Copy URL</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Activity>
    );
    const { rerender } = render(tab("visible"));
    fireEvent.keyDown(screen.getByText("Options"), { key: "Enter" });
    rerender(tab("visible"));
    expect(screen.getByRole("menu")).toBeTruthy();

    rerender(tab("hidden"));
    rerender(tab("visible"));

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByText("Options").getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("closes a controlled popover through its owner's state", () => {
    function StarredPages() {
      const [open, setOpen] = useState(false);
      return (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger>Starred</PopoverTrigger>
          <PopoverContent>example.com</PopoverContent>
        </Popover>
      );
    }
    const tab = (mode: Mode) => (
      <Activity mode={mode}>
        <StarredPages />
      </Activity>
    );
    const { rerender } = render(tab("visible"));
    fireEvent.click(screen.getByText("Starred"));
    expect(screen.getByText("example.com")).toBeTruthy();

    rerender(tab("hidden"));
    rerender(tab("visible"));

    expect(screen.queryByText("example.com")).toBeNull();
  });
});
