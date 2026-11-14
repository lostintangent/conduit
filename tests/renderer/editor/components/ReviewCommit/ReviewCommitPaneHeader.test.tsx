// @ts-nocheck
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReviewCommitPaneHeader } from "../../../../../src/renderer/components/panes/editor/components/ReviewCommit/ReviewCommitPaneHeader";
import { TooltipProvider } from "../../../../../src/renderer/components/ui/tooltip";

// Helper to wrap component with required providers
function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("ReviewCommitPaneHeader", () => {
  it("should render commit short ID", () => {
    renderWithProviders(
      <ReviewCommitPaneHeader
        shortId="abc1234"
        subject="Fix authentication bug"
      />,
    );

    expect(screen.getByText("abc1234")).toBeDefined();
  });

  it("should render commit subject", () => {
    renderWithProviders(
      <ReviewCommitPaneHeader
        shortId="abc1234"
        subject="Fix authentication bug"
      />,
    );

    expect(screen.getByText("Fix authentication bug")).toBeDefined();
  });

  it("should not show back button when onClose is not provided", () => {
    renderWithProviders(
      <ReviewCommitPaneHeader shortId="abc1234" subject="Fix bug" />,
    );

    expect(screen.queryByTestId("back-button")).toBeNull();
  });

  it("should call onClose when back button is clicked", () => {
    const onClose = vi.fn();
    renderWithProviders(
      <ReviewCommitPaneHeader
        shortId="abc1234"
        subject="Fix bug"
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByTestId("back-button"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
