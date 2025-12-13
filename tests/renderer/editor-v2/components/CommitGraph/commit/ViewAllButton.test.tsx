/**
 * Tests for the ViewAllButton component.
 *
 * These tests verify the icon button for viewing all commit changes.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ViewAllButton } from "@/components/panes/editor-v2/components/CommitGraph/commit/ViewAllButton";

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
  it("should render the button", () => {
    const onClick = vi.fn();
    renderWithProvider(<ViewAllButton onClick={onClick} />);

    expect(screen.getByTestId("view-all-button")).toBeTruthy();
  });

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
      screen.getByTestId("view-all-button").getAttribute("aria-label"),
    ).toBe("View all changes in this commit");
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

  it("should apply custom className", () => {
    const onClick = vi.fn();
    renderWithProvider(
      <ViewAllButton onClick={onClick} className="custom-class" />,
    );

    expect(
      screen.getByTestId("view-all-button").classList.contains("custom-class"),
    ).toBe(true);
  });

  it("should render as a button element", () => {
    const onClick = vi.fn();
    renderWithProvider(<ViewAllButton onClick={onClick} />);

    expect(screen.getByTestId("view-all-button").tagName).toBe("BUTTON");
  });

  it("should have hover effect styling", () => {
    const onClick = vi.fn();
    renderWithProvider(<ViewAllButton onClick={onClick} />);

    // Button should have opacity classes for hover effect
    const button = screen.getByTestId("view-all-button");
    expect(button.className).toContain("opacity-0");
    expect(button.className).toContain("group-hover:opacity-100");
  });
});
