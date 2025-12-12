/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "../../../../../src/renderer/components/ui/tooltip";
import { DiffModeToggle } from "../../../../../src/renderer/components/panes/editor-v2/components/shared/DiffModeToggle";

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Renders DiffModeToggle with required providers.
 */
function renderToggle(
  props: Partial<Parameters<typeof DiffModeToggle>[0]> = {},
) {
  const defaultProps = {
    isDiffMode: true,
    onToggle: vi.fn(),
  };

  return render(
    <TooltipProvider>
      <DiffModeToggle {...defaultProps} {...props} />
    </TooltipProvider>,
  );
}

// ============================================================================
// Tests
// ============================================================================

describe("DiffModeToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Rendering
  // ===========================================================================

  describe("rendering", () => {
    it("should render a button", () => {
      renderToggle();
      expect(screen.getByTestId("diff-mode-toggle")).not.toBeNull();
    });

    it("should render with toolbar variant by default", () => {
      const { container } = renderToggle();
      const button = container.querySelector("button");
      expect(button?.className).toContain("hover:bg-white/10");
    });

    it("should render with compact variant when specified", () => {
      const { container } = renderToggle({ variant: "compact" });
      const button = container.querySelector("button");
      expect(button?.className).toContain("hover:bg-accent");
    });
  });

  // ===========================================================================
  // Icon Display
  // ===========================================================================

  describe("icon display", () => {
    it("should show FileCode icon when in diff mode", () => {
      const { container } = renderToggle({ isDiffMode: true });
      // FileCode icon has a specific path pattern
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      // The icon should be present
      expect(svg?.classList.toString()).toContain("lucide");
    });

    it("should show Columns2 icon when in edit mode", () => {
      const { container } = renderToggle({ isDiffMode: false });
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg?.classList.toString()).toContain("lucide");
    });
  });

  // ===========================================================================
  // Click Handler
  // ===========================================================================

  describe("click handler", () => {
    it("should call onToggle when clicked", () => {
      const onToggle = vi.fn();
      renderToggle({ onToggle });

      fireEvent.click(screen.getByTestId("diff-mode-toggle"));

      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("should pass event to onToggle", () => {
      const onToggle = vi.fn();
      renderToggle({ onToggle });

      fireEvent.click(screen.getByTestId("diff-mode-toggle"));

      expect(onToggle).toHaveBeenCalledWith(expect.any(Object));
    });
  });

  // ===========================================================================
  // Variants
  // ===========================================================================

  describe("variants", () => {
    it("should apply toolbar styling for toolbar variant", () => {
      const { container } = renderToggle({ variant: "toolbar" });
      const button = container.querySelector("button");
      expect(button?.className).toContain("p-1");
      expect(button?.className).toContain("shrink-0");
    });

    it("should apply compact styling for compact variant", () => {
      const { container } = renderToggle({ variant: "compact" });
      const button = container.querySelector("button");
      expect(button?.className).toContain("h-6");
      expect(button?.className).toContain("w-6");
      expect(button?.className).toContain("p-0");
    });
  });

  // ===========================================================================
  // Accessibility
  // ===========================================================================

  describe("accessibility", () => {
    it("should have button type", () => {
      renderToggle();
      const button = screen.getByTestId("diff-mode-toggle");
      expect(button.getAttribute("type")).toBe("button");
    });
  });
});
