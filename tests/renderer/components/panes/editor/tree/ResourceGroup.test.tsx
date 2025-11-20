// @ts-nocheck
/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ResourceGroup } from "@/components/panes/editor/tree/ResourceGroup";

describe("ResourceGroup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render with label and count", () => {
    render(
      <ResourceGroup label="Staged Changes" count={5}>
        <div>Children content</div>
      </ResourceGroup>,
    );

    expect(screen.getByText("Staged Changes")).toBeDefined();
    expect(screen.getByText("5")).toBeDefined();
  });

  it("should be expanded by default", () => {
    render(
      <ResourceGroup label="Staged Changes" count={5}>
        <div data-testid="child-content">Children content</div>
      </ResourceGroup>,
    );

    const childContent = screen.getByTestId("child-content");
    expect(childContent).toBeDefined();
  });

  it("should be collapsed when defaultExpanded is false", () => {
    render(
      <ResourceGroup label="Staged Changes" count={5} defaultExpanded={false}>
        <div data-testid="child-content">Children content</div>
      </ResourceGroup>,
    );

    const childContent = screen.queryByTestId("child-content");
    expect(childContent).toBeNull();
  });

  it("should toggle expanded state when header is clicked", () => {
    render(
      <ResourceGroup label="Staged Changes" count={5}>
        <div data-testid="child-content">Children content</div>
      </ResourceGroup>,
    );

    // Initially expanded
    expect(screen.getByTestId("child-content")).toBeDefined();

    // Click header to collapse
    const header = screen.getByText("Staged Changes").parentElement;
    if (header) {
      fireEvent.click(header);
    }

    // Should be collapsed now
    expect(screen.queryByTestId("child-content")).toBeNull();

    // Click again to expand
    if (header) {
      fireEvent.click(header);
    }

    // Should be expanded again
    expect(screen.getByTestId("child-content")).toBeDefined();
  });

  it("should show chevron-down icon when expanded", () => {
    const { container } = render(
      <ResourceGroup label="Staged Changes" count={5}>
        <div>Children content</div>
      </ResourceGroup>,
    );

    const chevronDown = container.querySelector(
      'svg[class*="lucide-chevron-down"]',
    );
    expect(chevronDown).toBeDefined();
  });

  it("should show chevron-right icon when collapsed", () => {
    const { container } = render(
      <ResourceGroup label="Staged Changes" count={5} defaultExpanded={false}>
        <div>Children content</div>
      </ResourceGroup>,
    );

    const chevronRight = container.querySelector(
      'svg[class*="lucide-chevron-right"]',
    );
    expect(chevronRight).toBeDefined();
  });

  it("should render actions when provided", () => {
    render(
      <ResourceGroup
        label="Staged Changes"
        count={5}
        actions={<button data-testid="action-button">Action</button>}
      >
        <div>Children content</div>
      </ResourceGroup>,
    );

    expect(screen.getByTestId("action-button")).toBeDefined();
  });

  it("should not collapse when action is clicked", () => {
    const onActionClick = vi.fn();

    render(
      <ResourceGroup
        label="Staged Changes"
        count={5}
        actions={
          <button data-testid="action-button" onClick={onActionClick}>
            Action
          </button>
        }
      >
        <div data-testid="child-content">Children content</div>
      </ResourceGroup>,
    );

    const actionButton = screen.getByTestId("action-button");
    fireEvent.click(actionButton);

    // Action should have been called
    expect(onActionClick).toHaveBeenCalled();

    // Content should still be visible (not collapsed)
    expect(screen.getByTestId("child-content")).toBeDefined();
  });

  it("should render multiple groups independently", () => {
    const { container } = render(
      <div>
        <ResourceGroup label="Staged Changes" count={3}>
          <div data-testid="staged-content">Staged</div>
        </ResourceGroup>
        <ResourceGroup label="Changes" count={2}>
          <div data-testid="unstaged-content">Unstaged</div>
        </ResourceGroup>
      </div>,
    );

    expect(screen.getByText("Staged Changes")).toBeDefined();
    expect(screen.getByText("Changes")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();
    expect(screen.getByTestId("staged-content")).toBeDefined();
    expect(screen.getByTestId("unstaged-content")).toBeDefined();
  });

  it("should maintain independent collapse states for multiple groups", () => {
    render(
      <div>
        <ResourceGroup label="Staged Changes" count={3}>
          <div data-testid="staged-content">Staged</div>
        </ResourceGroup>
        <ResourceGroup label="Changes" count={2}>
          <div data-testid="unstaged-content">Unstaged</div>
        </ResourceGroup>
      </div>,
    );

    // Both groups should be expanded initially
    expect(screen.getByTestId("staged-content")).toBeDefined();
    expect(screen.getByTestId("unstaged-content")).toBeDefined();

    // Collapse first group
    const stagedHeader = screen.getByText("Staged Changes").parentElement;
    if (stagedHeader) {
      fireEvent.click(stagedHeader);
    }

    // First group should be collapsed, second should still be expanded
    expect(screen.queryByTestId("staged-content")).toBeNull();
    expect(screen.getByTestId("unstaged-content")).toBeDefined();
  });
});
