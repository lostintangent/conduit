import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "../../../../../src/renderer/components/ui/tooltip";
import { EditorActionButtons } from "../../../../../src/renderer/components/panes/editor/components/shared/EditorActionButtons";

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Renders EditorActionButtons with required providers.
 */
function renderButtons(
  props: Partial<Parameters<typeof EditorActionButtons>[0]> = {},
) {
  const defaultProps = {
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onSave: vi.fn(),
    canUndo: true,
    canRedo: true,
    canSave: true,
  };

  return render(
    <TooltipProvider>
      <EditorActionButtons {...defaultProps} {...props} />
    </TooltipProvider>,
  );
}

// ============================================================================
// Tests
// ============================================================================

describe("EditorActionButtons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Rendering
  // ===========================================================================

  describe("rendering", () => {
    it("should not render find button when onFind is not provided", () => {
      renderButtons();
      expect(screen.queryByTestId("find-button")).toBeNull();
    });
  });

  // ===========================================================================
  // Button Actions
  // ===========================================================================

  describe("button actions", () => {
    it("should call onUndo when undo button is clicked", () => {
      const onUndo = vi.fn();
      renderButtons({ onUndo });

      fireEvent.click(screen.getByTestId("undo-button"));

      expect(onUndo).toHaveBeenCalledTimes(1);
    });

    it("should call onRedo when redo button is clicked", () => {
      const onRedo = vi.fn();
      renderButtons({ onRedo });

      fireEvent.click(screen.getByTestId("redo-button"));

      expect(onRedo).toHaveBeenCalledTimes(1);
    });

    it("should call onSave when save button is clicked", () => {
      const onSave = vi.fn();
      renderButtons({ onSave });

      fireEvent.click(screen.getByTestId("save-button"));

      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("should call onFind when find button is clicked", () => {
      const onFind = vi.fn();
      renderButtons({ onFind });

      fireEvent.click(screen.getByTestId("find-button"));

      expect(onFind).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // Disabled States
  // ===========================================================================

  describe("disabled states", () => {
    it("should disable undo button when canUndo is false", () => {
      renderButtons({ canUndo: false });

      const button = screen.getByTestId("undo-button") as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });

    it("should disable redo button when canRedo is false", () => {
      renderButtons({ canRedo: false });

      const button = screen.getByTestId("redo-button") as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });

    it("should disable save button when canSave is false", () => {
      renderButtons({ canSave: false });

      const button = screen.getByTestId("save-button") as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });

    it("should not call onUndo when button is disabled", () => {
      const onUndo = vi.fn();
      renderButtons({ onUndo, canUndo: false });

      fireEvent.click(screen.getByTestId("undo-button"));

      expect(onUndo).not.toHaveBeenCalled();
    });

    it("should not call onRedo when button is disabled", () => {
      const onRedo = vi.fn();
      renderButtons({ onRedo, canRedo: false });

      fireEvent.click(screen.getByTestId("redo-button"));

      expect(onRedo).not.toHaveBeenCalled();
    });

    it("should not call onSave when button is disabled", () => {
      const onSave = vi.fn();
      renderButtons({ onSave, canSave: false });

      fireEvent.click(screen.getByTestId("save-button"));

      expect(onSave).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Event Propagation
  // ===========================================================================

  describe("event propagation", () => {
    it("should stop click propagation on container", () => {
      const parentClickHandler = vi.fn();

      render(
        <TooltipProvider>
          <div onClick={parentClickHandler}>
            <EditorActionButtons
              onUndo={vi.fn()}
              onRedo={vi.fn()}
              onSave={vi.fn()}
              canUndo={true}
              canRedo={true}
              canSave={true}
            />
          </div>
        </TooltipProvider>,
      );

      fireEvent.click(screen.getByTestId("undo-button"));

      // Parent should not receive the click
      expect(parentClickHandler).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // All Buttons Disabled
  // ===========================================================================

  describe("all buttons disabled", () => {
    it("should render all buttons disabled when all can* props are false", () => {
      renderButtons({
        canUndo: false,
        canRedo: false,
        canSave: false,
      });

      const undoButton = screen.getByTestId("undo-button") as HTMLButtonElement;
      const redoButton = screen.getByTestId("redo-button") as HTMLButtonElement;
      const saveButton = screen.getByTestId("save-button") as HTMLButtonElement;

      expect(undoButton.disabled).toBe(true);
      expect(redoButton.disabled).toBe(true);
      expect(saveButton.disabled).toBe(true);
    });
  });
});
