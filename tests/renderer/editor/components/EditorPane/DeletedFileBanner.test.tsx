import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeletedFileBanner } from "../../../../../src/renderer/components/panes/editor/components/EditorPane/DeletedFileBanner";

describe("DeletedFileBanner", () => {
  it("should render the deleted file message", () => {
    render(<DeletedFileBanner />);

    const element = screen.getByText(
      "This file has been deleted. Showing content from HEAD.",
    );
    expect(element).toBeTruthy();
  });

  it("should have the correct test id", () => {
    render(<DeletedFileBanner />);

    const element = screen.getByTestId("deleted-file-banner");
    expect(element).toBeTruthy();
  });

  it("should have role=status for accessibility", () => {
    render(<DeletedFileBanner />);

    const element = screen.getByRole("status");
    expect(element).toBeTruthy();
  });

  it("should have appropriate styling classes", () => {
    render(<DeletedFileBanner />);

    const banner = screen.getByTestId("deleted-file-banner");
    expect(banner.className).toContain("bg-muted");
    expect(banner.className).toContain("border-b");
  });
});
