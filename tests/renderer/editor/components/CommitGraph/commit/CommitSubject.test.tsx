/**
 * Tests for the CommitSubject component.
 *
 * These tests verify the display of commit subject lines
 * with optional tooltip for full message.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommitSubject } from "@/components/panes/editor/components/CommitGraph/commit/CommitSubject";

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

describe("CommitSubject", () => {
  it("should render the subject text", () => {
    renderWithProvider(
      <CommitSubject
        subject="Fix authentication bug"
        message="Fix authentication bug"
      />,
    );

    expect(screen.getByTestId("commit-subject").textContent).toBe(
      "Fix authentication bug",
    );
  });

  it("should render subject as span element", () => {
    renderWithProvider(
      <CommitSubject subject="Short subject" message="Short subject" />,
    );

    const subject = screen.getByTestId("commit-subject");
    expect(subject.tagName).toBe("SPAN");
  });

  it("should render correctly when message has more content", () => {
    renderWithProvider(
      <CommitSubject
        subject="Fix bug"
        message="Fix bug\n\nThis is a longer description of the fix."
      />,
    );

    // Component should render without errors
    const subject = screen.getByTestId("commit-subject");
    expect(subject).toBeTruthy();
    expect(subject.textContent).toBe("Fix bug");
  });

  it("should apply custom className", () => {
    renderWithProvider(
      <CommitSubject
        subject="Test subject"
        message="Test subject"
        className="custom-class"
      />,
    );

    expect(
      screen.getByTestId("commit-subject").classList.contains("custom-class"),
    ).toBe(true);
  });

  it("should have truncate class for long text", () => {
    renderWithProvider(
      <CommitSubject
        subject="A very long subject line that should be truncated with ellipsis when it overflows"
        message="A very long subject line that should be truncated with ellipsis when it overflows"
      />,
    );

    expect(
      screen.getByTestId("commit-subject").classList.contains("truncate"),
    ).toBe(true);
  });

  it("should handle empty subject", () => {
    renderWithProvider(<CommitSubject subject="" message="" />);

    expect(screen.getByTestId("commit-subject").textContent).toBe("");
  });

  it("should handle subject with special characters", () => {
    const subject = 'Fix "quotes" & <angles>';
    renderWithProvider(<CommitSubject subject={subject} message={subject} />);

    expect(screen.getByTestId("commit-subject").textContent).toBe(subject);
  });

  it("should handle message that matches subject", () => {
    renderWithProvider(
      <CommitSubject subject="Same line" message="Same line" />,
    );

    const subject = screen.getByTestId("commit-subject");
    expect(subject.textContent).toBe("Same line");
  });

  it("should handle message with additional body content", () => {
    renderWithProvider(
      <CommitSubject
        subject="First line"
        message="First line\n\nMore content here"
      />,
    );

    const subject = screen.getByTestId("commit-subject");
    // Subject should only show first line, not the body
    expect(subject.textContent).toBe("First line");
  });
});
