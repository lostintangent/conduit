import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMarkdownPreview } from "../../../../src/renderer/components/panes/editor/hooks/useMarkdownPreview";
import React from "react";
import { userSettingsAtom } from "@/store/atoms";

// ============================================================================
// Mocks
// ============================================================================

const setTheme = (theme: "dark" | "light" | "system") =>
  userSettingsAtom.set((settings) => ({ ...settings, theme }));

vi.mock("@/utils/theme", () => ({
  resolveTheme: (theme: string) => theme,
}));

// ============================================================================
// Tests
// ============================================================================

describe("useMarkdownPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setTheme("dark");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Mermaid Configuration
  // ===========================================================================

  describe("mermaid configuration", () => {
    it("should return dark theme config when theme is dark", () => {
      setTheme("dark");

      const { result } = renderHook(() => useMarkdownPreview());

      expect(result.current.mermaidConfig).toEqual({
        config: {
          theme: "dark",
        },
      });
    });

    it("should return default theme config when theme is light", () => {
      setTheme("light");

      const { result } = renderHook(() => useMarkdownPreview());

      expect(result.current.mermaidConfig).toEqual({
        config: {
          theme: "default",
        },
      });
    });

    it("should memoize mermaid config", () => {
      const { result, rerender } = renderHook(() => useMarkdownPreview());

      const firstConfig = result.current.mermaidConfig;
      rerender();
      const secondConfig = result.current.mermaidConfig;

      expect(firstConfig).toBe(secondConfig);
    });
  });

  // ===========================================================================
  // Container Ref
  // ===========================================================================

  describe("container ref", () => {
    it("should return a ref object", () => {
      const { result } = renderHook(() => useMarkdownPreview());

      expect(result.current.containerRef).toBeDefined();
      expect(result.current.containerRef.current).toBe(null);
    });

    it("should persist ref across rerenders", () => {
      const { result, rerender } = renderHook(() => useMarkdownPreview());

      const firstRef = result.current.containerRef;
      rerender();
      const secondRef = result.current.containerRef;

      expect(firstRef).toBe(secondRef);
    });
  });

  // ===========================================================================
  // Click Handler
  // ===========================================================================

  describe("click handler", () => {
    it("should return a click handler function", () => {
      const { result } = renderHook(() => useMarkdownPreview());

      expect(typeof result.current.handleClick).toBe("function");
    });

    it("should memoize click handler", () => {
      const { result, rerender } = renderHook(() => useMarkdownPreview());

      const firstHandler = result.current.handleClick;
      rerender();
      const secondHandler = result.current.handleClick;

      expect(firstHandler).toBe(secondHandler);
    });

    it("should do nothing when target is not an anchor", () => {
      const { result } = renderHook(() => useMarkdownPreview());

      const mockEvent = {
        target: document.createElement("div"),
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent<HTMLDivElement>;

      act(() => {
        result.current.handleClick(mockEvent);
      });

      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    });

    it("should do nothing when anchor href does not start with #", () => {
      const { result } = renderHook(() => useMarkdownPreview());

      const anchor = document.createElement("a");
      anchor.href = "https://example.com";

      const mockEvent = {
        target: anchor,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent<HTMLDivElement>;

      act(() => {
        result.current.handleClick(mockEvent);
      });

      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    });

    it("should prevent default and scroll to element for anchor links", () => {
      const { result } = renderHook(() => useMarkdownPreview());

      // Create a container with the ref
      const container = document.createElement("div");
      const targetElement = document.createElement("h2");
      targetElement.id = "test-heading";
      targetElement.scrollIntoView = vi.fn();
      container.appendChild(targetElement);

      // Set the ref
      (
        result.current.containerRef as React.MutableRefObject<HTMLDivElement>
      ).current = container;

      // Create anchor element
      const anchor = document.createElement("a");
      anchor.setAttribute("href", "#test-heading");

      const mockEvent = {
        target: anchor,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent<HTMLDivElement>;

      act(() => {
        result.current.handleClick(mockEvent);
      });

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(targetElement.scrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "center",
      });
    });

    it("should handle anchor within nested element", () => {
      const { result } = renderHook(() => useMarkdownPreview());

      // Create a container with the ref
      const container = document.createElement("div");
      const targetElement = document.createElement("h2");
      targetElement.id = "nested-heading";
      targetElement.scrollIntoView = vi.fn();
      container.appendChild(targetElement);

      // Set the ref
      (
        result.current.containerRef as React.MutableRefObject<HTMLDivElement>
      ).current = container;

      // Create nested structure: span inside anchor
      const anchor = document.createElement("a");
      anchor.setAttribute("href", "#nested-heading");
      const span = document.createElement("span");
      span.textContent = "Link text";
      anchor.appendChild(span);

      const mockEvent = {
        target: span, // Click on span, not anchor
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent<HTMLDivElement>;

      act(() => {
        result.current.handleClick(mockEvent);
      });

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(targetElement.scrollIntoView).toHaveBeenCalled();
    });

    it("should not throw when target element does not exist", () => {
      const { result } = renderHook(() => useMarkdownPreview());

      // Create empty container
      const container = document.createElement("div");
      (
        result.current.containerRef as React.MutableRefObject<HTMLDivElement>
      ).current = container;

      const anchor = document.createElement("a");
      anchor.setAttribute("href", "#nonexistent");

      const mockEvent = {
        target: anchor,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent<HTMLDivElement>;

      // Should not throw
      expect(() => {
        act(() => {
          result.current.handleClick(mockEvent);
        });
      }).not.toThrow();

      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });

    it("should handle null container ref gracefully", () => {
      const { result } = renderHook(() => useMarkdownPreview());

      // Ref is null by default
      expect(result.current.containerRef.current).toBe(null);

      const anchor = document.createElement("a");
      anchor.setAttribute("href", "#some-id");

      const mockEvent = {
        target: anchor,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent<HTMLDivElement>;

      // Should not throw
      expect(() => {
        act(() => {
          result.current.handleClick(mockEvent);
        });
      }).not.toThrow();

      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });
  });
});
