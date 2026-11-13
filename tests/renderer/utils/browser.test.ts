import { normalizeUrl } from "@/utils/browser";
import { describe, expect, it } from "vitest";

describe("normalizeUrl", () => {
  it.each([
    ["file:///tmp/page.html", "file:///tmp/page.html"],
    ["https://example.com", "https://example.com"],
    ["example.com/docs", "https://example.com/docs"],
    ["localhost:3000", "http://localhost:3000"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });
});
