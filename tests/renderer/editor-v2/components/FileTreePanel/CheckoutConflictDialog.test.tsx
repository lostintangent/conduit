/**
 * Tests for CheckoutConflictDialog component.
 *
 * Tests the dialog that appears when checkout fails due to
 * uncommitted changes, offering Stash & Checkout, Force Checkout, or Cancel.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CheckoutConflictDialog } from "@/components/panes/editor-v2/components/FileTreePanel/CheckoutConflictDialog";

// ============================================================================
// Tests
// ============================================================================

describe("CheckoutConflictDialog", () => {
  const mockOnStashAndCheckout = vi.fn();
  const mockOnForceCheckout = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render nothing when not open", () => {
      const { container } = render(
        <CheckoutConflictDialog
          isOpen={false}
          targetBranch="develop"
          isLoading={false}
          onStashAndCheckout={mockOnStashAndCheckout}
          onForceCheckout={mockOnForceCheckout}
          onCancel={mockOnCancel}
        />,
      );

      // Dialog should not render any visible content
      expect(screen.queryByText("Uncommitted Changes")).toBeNull();
    });

    it("should render dialog with target branch name when open", () => {
      render(
        <CheckoutConflictDialog
          isOpen={true}
          targetBranch="develop"
          isLoading={false}
          onStashAndCheckout={mockOnStashAndCheckout}
          onForceCheckout={mockOnForceCheckout}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.getByText("Uncommitted Changes")).toBeDefined();
      expect(screen.getByText(/develop/)).toBeDefined();
    });

    it("should render all three action buttons", () => {
      render(
        <CheckoutConflictDialog
          isOpen={true}
          targetBranch="develop"
          isLoading={false}
          onStashAndCheckout={mockOnStashAndCheckout}
          onForceCheckout={mockOnForceCheckout}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.getByText("Stash & Checkout")).toBeDefined();
      expect(screen.getByText("Force Checkout")).toBeDefined();
      expect(screen.getByText("Cancel")).toBeDefined();
    });
  });

  describe("button interactions", () => {
    it("should call onStashAndCheckout when Stash & Checkout is clicked", () => {
      render(
        <CheckoutConflictDialog
          isOpen={true}
          targetBranch="develop"
          isLoading={false}
          onStashAndCheckout={mockOnStashAndCheckout}
          onForceCheckout={mockOnForceCheckout}
          onCancel={mockOnCancel}
        />,
      );

      const stashButton = screen.getByText("Stash & Checkout");
      fireEvent.click(stashButton);

      expect(mockOnStashAndCheckout).toHaveBeenCalled();
    });

    it("should call onForceCheckout when Force Checkout is clicked", () => {
      render(
        <CheckoutConflictDialog
          isOpen={true}
          targetBranch="develop"
          isLoading={false}
          onStashAndCheckout={mockOnStashAndCheckout}
          onForceCheckout={mockOnForceCheckout}
          onCancel={mockOnCancel}
        />,
      );

      const forceButton = screen.getByText("Force Checkout");
      fireEvent.click(forceButton);

      expect(mockOnForceCheckout).toHaveBeenCalled();
    });

    it("should call onCancel when Cancel is clicked", () => {
      render(
        <CheckoutConflictDialog
          isOpen={true}
          targetBranch="develop"
          isLoading={false}
          onStashAndCheckout={mockOnStashAndCheckout}
          onForceCheckout={mockOnForceCheckout}
          onCancel={mockOnCancel}
        />,
      );

      const cancelButton = screen.getByText("Cancel");
      fireEvent.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  describe("loading state", () => {
    it("should disable buttons when loading", () => {
      render(
        <CheckoutConflictDialog
          isOpen={true}
          targetBranch="develop"
          isLoading={true}
          onStashAndCheckout={mockOnStashAndCheckout}
          onForceCheckout={mockOnForceCheckout}
          onCancel={mockOnCancel}
        />,
      );

      // Use data-testid for reliable selection (button text changes to "Switching..." when loading)
      const stashButton = screen.getByTestId("checkout-conflict-stash");
      const forceButton = screen.getByTestId("checkout-conflict-force");
      const cancelButton = screen.getByTestId("checkout-conflict-cancel");

      expect(stashButton.hasAttribute("disabled")).toBe(true);
      expect(forceButton.hasAttribute("disabled")).toBe(true);
      expect(cancelButton.hasAttribute("disabled")).toBe(true);
    });

    it("should show 'Switching...' text when loading", () => {
      render(
        <CheckoutConflictDialog
          isOpen={true}
          targetBranch="develop"
          isLoading={true}
          onStashAndCheckout={mockOnStashAndCheckout}
          onForceCheckout={mockOnForceCheckout}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.getByText("Switching...")).toBeDefined();
    });

    it("should not call handlers when buttons are clicked while loading", () => {
      render(
        <CheckoutConflictDialog
          isOpen={true}
          targetBranch="develop"
          isLoading={true}
          onStashAndCheckout={mockOnStashAndCheckout}
          onForceCheckout={mockOnForceCheckout}
          onCancel={mockOnCancel}
        />,
      );

      // Use data-testid since button text changes when loading
      const stashButton = screen.getByTestId("checkout-conflict-stash");
      fireEvent.click(stashButton);

      expect(mockOnStashAndCheckout).not.toHaveBeenCalled();
    });
  });
});
