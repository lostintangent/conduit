import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  LazyMarkdownPreview,
  preloadMarkdownPreview,
} from "../../../../../src/renderer/components/panes/editor/components/EditorPane/LazyMarkdownPreview";

vi.mock(
  "../../../../../src/renderer/components/panes/editor/hooks/useMarkdownPreview",
  () => ({
    useMarkdownPreview: () => ({
      mermaidConfig: { config: { theme: "dark" } },
      handleClick: () => {},
      containerRef: { current: null as HTMLDivElement | null },
    }),
  }),
);

describe("LazyMarkdownPreview", () => {
  // Runs first, before anything has loaded the preview
  it("loads the preview the first time it's shown", async () => {
    const { container } = render(<LazyMarkdownPreview content="# Title" />);
    expect(container.innerHTML).toBe("");

    await act(() => preloadMarkdownPreview());

    expect(
      screen.getByRole("heading", { level: 1, name: "Title" }),
    ).not.toBeNull();
  });

  it("shows a loaded preview on its first render", async () => {
    await preloadMarkdownPreview();

    render(<LazyMarkdownPreview content="# Ready" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Ready" }),
    ).not.toBeNull();
  });
});
