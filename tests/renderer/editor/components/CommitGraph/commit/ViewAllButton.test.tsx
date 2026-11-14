/**
 * Tests for the ViewAllButton component.
 *
 * These tests verify the icon button for viewing all commit changes.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ViewAllButton } from "@/components/panes/editor/components/CommitGraph/commit/ViewAllButton";

// =============================================================================
// Test Helpers
// =============================================================================

function TestWrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

function renderWithProvider(ui: React.ReactElement) {
  return render(ui, { wrapper: TestWrapper });
}

// =============================================================================
// Tests
// =============================================================================

describe("ViewAllButton", () => {
  it("should call onClick when clicked", () => {
    const onClick = vi.fn();
    renderWithProvider(<ViewAllButton onClick={onClick} />);

    fireEvent.click(screen.getByTestId("view-all-button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("should stop event propagation on click", () => {
    const onClick = vi.fn();
    const parentClick = vi.fn();

    renderWithProvider(
      <div onClick={parentClick}>
        <ViewAllButton onClick={onClick} />
      </div>,
    );

    fireEvent.click(screen.getByTestId("view-all-button"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("should have accessible aria-label", () => {
    const onClick = vi.fn();
    renderWithProvider(<ViewAllButton onClick={onClick} />);

    expect(
      screen.getByRole("button", { name: "View all changes in this commit" }),
    ).toBeDefined();
  });

  it("should be disabled when disabled prop is true", () => {
    const onClick = vi.fn();
    renderWithProvider(<ViewAllButton onClick={onClick} disabled />);

    const button = screen.getByTestId("view-all-button");
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("should not call onClick when disabled", () => {
    const onClick = vi.fn();
    renderWithProvider(<ViewAllButton onClick={onClick} disabled />);

    fireEvent.click(screen.getByTestId("view-all-button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});
