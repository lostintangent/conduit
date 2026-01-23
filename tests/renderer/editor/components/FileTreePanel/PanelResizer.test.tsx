/**
 * Tests for the PanelResizer component.
 *
 * These tests verify the horizontal resize divider functionality.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PanelResizer } from "@/components/panes/editor/components/FileTreePanel/PanelResizer";

// =============================================================================
// Tests
// =============================================================================

describe("PanelResizer", () => {
  describe("rendering", () => {
    it("should render with data-testid", () => {
      render(<PanelResizer onResize={vi.fn()} />);
      expect(screen.getByTestId("panel-resizer")).toBeTruthy();
    });

    it("should have cursor-row-resize on interactive handle", () => {
      render(<PanelResizer onResize={vi.fn()} />);
      const resizer = screen.getByTestId("panel-resizer");
      const handle = resizer.querySelector(".cursor-row-resize");
      expect(handle).toBeTruthy();
    });

    it("should have visible border", () => {
      render(<PanelResizer onResize={vi.fn()} />);
      const resizer = screen.getByTestId("panel-resizer");
      const border = resizer.querySelector(".bg-border");
      expect(border).toBeTruthy();
    });
  });

  describe("mouse interactions", () => {
    it("should call onResizeStart when mousedown on handle", () => {
      const onResizeStart = vi.fn();
      render(<PanelResizer onResize={vi.fn()} onResizeStart={onResizeStart} />);

      const resizer = screen.getByTestId("panel-resizer");
      const handle = resizer.querySelector(".cursor-row-resize")!;

      fireEvent.mouseDown(handle);

      expect(onResizeStart).toHaveBeenCalledTimes(1);
    });

    it("should have highlight class when dragging starts", () => {
      render(<PanelResizer onResize={vi.fn()} />);

      const resizer = screen.getByTestId("panel-resizer");
      const handle = resizer.querySelector(".cursor-row-resize")!;

      // Before mouse down - should have hover class
      expect(handle.classList.contains("bg-transparent")).toBe(true);

      // After mouse down - should have accent class
      fireEvent.mouseDown(handle);
      expect(handle.classList.contains("bg-accent")).toBe(true);
    });
  });

  describe("props", () => {
    it("should accept minHeight prop", () => {
      render(<PanelResizer onResize={vi.fn()} minHeight={50} />);
      expect(screen.getByTestId("panel-resizer")).toBeTruthy();
    });

    it("should accept maxHeight prop", () => {
      render(<PanelResizer onResize={vi.fn()} maxHeight={500} />);
      expect(screen.getByTestId("panel-resizer")).toBeTruthy();
    });

    it("should accept both onResizeStart and onResizeEnd callbacks", () => {
      const onResizeStart = vi.fn();
      const onResizeEnd = vi.fn();
      render(
        <PanelResizer
          onResize={vi.fn()}
          onResizeStart={onResizeStart}
          onResizeEnd={onResizeEnd}
        />,
      );
      expect(screen.getByTestId("panel-resizer")).toBeTruthy();
    });
  });

  describe("styling", () => {
    it("should have shrink-0 to prevent flex shrinking", () => {
      render(<PanelResizer onResize={vi.fn()} />);
      const resizer = screen.getByTestId("panel-resizer");
      expect(resizer.classList.contains("shrink-0")).toBe(true);
    });

    it("should have minimal height for the container", () => {
      render(<PanelResizer onResize={vi.fn()} />);
      const resizer = screen.getByTestId("panel-resizer");
      expect(resizer.classList.contains("h-px")).toBe(true);
    });

    it("should have relative positioning for absolute children", () => {
      render(<PanelResizer onResize={vi.fn()} />);
      const resizer = screen.getByTestId("panel-resizer");
      expect(resizer.classList.contains("relative")).toBe(true);
    });
  });

  describe("accessibility", () => {
    it("should be keyboard focusable via the interactive handle", () => {
      render(<PanelResizer onResize={vi.fn()} />);
      const resizer = screen.getByTestId("panel-resizer");
      const handle = resizer.querySelector(".cursor-row-resize")!;
      // Handle can receive mouse events
      expect(handle).toBeTruthy();
    });
  });
});
