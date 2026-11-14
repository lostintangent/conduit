/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownPreview } from "../../../../../src/renderer/components/panes/editor/components/EditorPane/MarkdownPreview";

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

const shiki = vi.hoisted(() => ({ loads: 0 }));
vi.mock("@streamdown/code", () => {
  shiki.loads++;
  return vi.importActual("@streamdown/code");
});
const shikiLoadsOnImport = shiki.loads;

describe("MarkdownPreview", () => {
  it("loads Shiki when the first code block renders", async () => {
    expect(shikiLoadsOnImport).toBe(0);

    const { container } = render(
      <MarkdownPreview content={"```ts\nconst x = 1;\n```"} />,
    );

    await waitFor(() => {
      expect(
        container.querySelector(
          '[data-streamdown="code-block-body"] code span[style*="--shiki-dark"]',
        ),
      ).not.toBeNull();
    });
    expect(shiki.loads).toBe(1);
  });

  it("renders $$ blocks with KaTeX", () => {
    const { container } = render(<MarkdownPreview content={"$$\nx^2\n$$"} />);

    expect(container.querySelector(".katex-display .katex")).not.toBeNull();
  });

  it("renders links as anchors without a confirmation step", () => {
    render(<MarkdownPreview content="[docs](https://example.com)" />);

    const link = screen.getByRole("link", { name: "docs" });
    expect(link.getAttribute("href")).toBe("https://example.com");
  });

  it("closes emphasis that ends in CJK punctuation", () => {
    const { container } = render(
      <MarkdownPreview content="**太字です。**次の文" />,
    );

    expect(
      container.querySelector('[data-streamdown="strong"]')?.textContent,
    ).toBe("太字です。");
  });

  it("shows code blocks and tables at full height", async () => {
    const { container } = render(
      <MarkdownPreview content={"```text\nline\n```\n\n| a |\n|---|\n| 1 |"} />,
    );

    await waitFor(() => {
      expect(
        container.querySelector('[data-streamdown="code-block-body"]'),
      ).not.toBeNull();
      expect(container.querySelector("table")).not.toBeNull();
    });
    expect(container.querySelectorAll('[style*="max-height"]')).toHaveLength(0);
  });
});
