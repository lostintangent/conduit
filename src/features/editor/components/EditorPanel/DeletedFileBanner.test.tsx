import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeletedFileBanner } from "./DeletedFileBanner";

describe("DeletedFileBanner", () => {
  it("should render the deleted file message", () => {
    render(<DeletedFileBanner />);

    const element = screen.getByText(
      "This file has been deleted. Showing content from HEAD.",
    );
    expect(element).toBeTruthy();
  });

  it("should have role=status for accessibility", () => {
    render(<DeletedFileBanner />);

    const element = screen.getByRole("status");
    expect(element).toBeTruthy();
  });
});
