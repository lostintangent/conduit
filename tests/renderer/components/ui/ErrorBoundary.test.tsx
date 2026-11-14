import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "@/components/ui/error-boundary";

function View({ name }: { name: string }) {
  if (name === "broken") {
    throw new Error("View broke");
  }
  return <p>{name}</p>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows its children again once resetKey changes, like a file or view switch", () => {
    const show = (name: string) => (
      <ErrorBoundary resetKey={name}>
        <View name={name} />
      </ErrorBoundary>
    );
    const { rerender } = render(show("broken"));
    expect(screen.getByText("View broke")).not.toBeNull();

    rerender(show("working"));

    expect(screen.getByText("working")).not.toBeNull();
  });
});
