/**
 * Tests for the CommitFileStatusBadge component.
 *
 * These tests verify the display of status badges for
 * different file change types in commits.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  CommitFileStatusBadge,
  getCommitFileStatusConfig,
} from "@/components/panes/editor-v2/components/CommitGraph/files/CommitFileStatusBadge";
import type { CommitFile } from "@/components/panes/editor-v2/components/CommitGraph/types";

// =============================================================================
// Helper
// =============================================================================

function renderBadge(status: CommitFile["status"]) {
  return render(<CommitFileStatusBadge status={status} />);
}

// =============================================================================
// Tests
// =============================================================================

describe("CommitFileStatusBadge", () => {
  describe("rendering", () => {
    it("should render with data-testid", () => {
      renderBadge("modified");
      expect(screen.getByTestId("commit-file-status-badge")).toBeTruthy();
    });

    it("should set data-status attribute", () => {
      renderBadge("added");
      const badge = screen.getByTestId("commit-file-status-badge");
      expect(badge.getAttribute("data-status")).toBe("added");
    });
  });

  describe("status letters", () => {
    it("should display 'A' for added files", () => {
      renderBadge("added");
      expect(screen.getByTestId("commit-file-status-badge").textContent).toBe(
        "A",
      );
    });

    it("should display 'M' for modified files", () => {
      renderBadge("modified");
      expect(screen.getByTestId("commit-file-status-badge").textContent).toBe(
        "M",
      );
    });

    it("should display 'D' for deleted files", () => {
      renderBadge("deleted");
      expect(screen.getByTestId("commit-file-status-badge").textContent).toBe(
        "D",
      );
    });

    it("should display 'R' for renamed files", () => {
      renderBadge("renamed");
      expect(screen.getByTestId("commit-file-status-badge").textContent).toBe(
        "R",
      );
    });

    it("should display 'C' for copied files", () => {
      renderBadge("copied");
      expect(screen.getByTestId("commit-file-status-badge").textContent).toBe(
        "C",
      );
    });
  });

  describe("title/tooltip", () => {
    it("should have title 'Added' for added files", () => {
      renderBadge("added");
      expect(
        screen.getByTestId("commit-file-status-badge").getAttribute("title"),
      ).toBe("Added");
    });

    it("should have title 'Modified' for modified files", () => {
      renderBadge("modified");
      expect(
        screen.getByTestId("commit-file-status-badge").getAttribute("title"),
      ).toBe("Modified");
    });

    it("should have title 'Deleted' for deleted files", () => {
      renderBadge("deleted");
      expect(
        screen.getByTestId("commit-file-status-badge").getAttribute("title"),
      ).toBe("Deleted");
    });

    it("should have title 'Renamed' for renamed files", () => {
      renderBadge("renamed");
      expect(
        screen.getByTestId("commit-file-status-badge").getAttribute("title"),
      ).toBe("Renamed");
    });

    it("should have title 'Copied' for copied files", () => {
      renderBadge("copied");
      expect(
        screen.getByTestId("commit-file-status-badge").getAttribute("title"),
      ).toBe("Copied");
    });
  });

  describe("custom className", () => {
    it("should apply custom className", () => {
      render(
        <CommitFileStatusBadge status="modified" className="custom-class" />,
      );
      const badge = screen.getByTestId("commit-file-status-badge");
      expect(badge.classList.contains("custom-class")).toBe(true);
    });
  });
});

describe("getCommitFileStatusConfig", () => {
  it("should return config for added status", () => {
    const config = getCommitFileStatusConfig("added");
    expect(config.letter).toBe("A");
    expect(config.label).toBe("Added");
    expect(config.bgColor).toBe("bg-git-added");
    expect(config.textColor).toBe("text-git-added");
  });

  it("should return config for modified status", () => {
    const config = getCommitFileStatusConfig("modified");
    expect(config.letter).toBe("M");
    expect(config.label).toBe("Modified");
  });

  it("should return config for deleted status", () => {
    const config = getCommitFileStatusConfig("deleted");
    expect(config.letter).toBe("D");
    expect(config.label).toBe("Deleted");
  });

  it("should return config for renamed status", () => {
    const config = getCommitFileStatusConfig("renamed");
    expect(config.letter).toBe("R");
    expect(config.label).toBe("Renamed");
  });

  it("should return config for copied status", () => {
    const config = getCommitFileStatusConfig("copied");
    expect(config.letter).toBe("C");
    expect(config.label).toBe("Copied");
  });
});
