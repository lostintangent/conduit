// @ts-nocheck
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReviewCommitPane } from "../../../../../src/renderer/components/panes/editor/components/ReviewCommit/ReviewCommitPane";
import { TooltipProvider } from "../../../../../src/renderer/components/ui/tooltip";

vi.mock(
  "../../../../../src/renderer/components/panes/editor/components/shared",
  () => ({
    FileEditor: ({ filePath, isExpanded, onToggle }) => (
      <button
        data-testid={`file-${filePath}`}
        data-expanded={String(isExpanded)}
        onClick={onToggle}
      >
        {filePath}
      </button>
    ),
  }),
);

const file = (path) => ({
  path,
  status: "M",
  additions: 1,
  deletions: 0,
  isBinary: false,
});

const pane = (props) => (
  <TooltipProvider>
    <ReviewCommitPane
      cwd="/project"
      commitId="abc1234567890"
      parentCommitId="def0987654321"
      files={[]}
      {...props}
    />
  </TooltipProvider>
);

const expanded = (path) =>
  screen.getByTestId(`file-${path}`).getAttribute("data-expanded");

describe("ReviewCommitPane", () => {
  it("expands every file of a commit it switches to", () => {
    const { rerender } = render(pane({ files: [file("a.ts")] }));
    fireEvent.click(screen.getByTestId("file-a.ts"));

    rerender(pane({ commitId: "fed9876543210", files: [file("b.ts")] }));

    expect(expanded("b.ts")).toBe("true");
  });
});
