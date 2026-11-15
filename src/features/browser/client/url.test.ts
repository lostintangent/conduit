import { normalizeUrl } from "@features/browser/client/url";
import { describe, expect, it } from "vitest";

const search = (query: string) =>
  `https://www.bing.com/search?q=${encodeURIComponent(query)}`;

describe("normalizeUrl", () => {
  it.each([
    ["file:///tmp/page.html", "file:///tmp/page.html"],
    ["https://example.com", "https://example.com"],
    ["example.com/docs", "https://example.com/docs"],
    ["localhost:3000", "http://localhost:3000"],
    ["localhost", "http://localhost"],
    ["app.localhost:5173/home", "http://app.localhost:5173/home"],
    ["printer.local", "http://printer.local"],
    ["blog.test/posts", "http://blog.test/posts"],
    ["192.168.1.20:8080", "http://192.168.1.20:8080"],
    ["127.0.0.1", "http://127.0.0.1"],
    ["[::1]:3000/", "http://[::1]:3000/"],
    ["weather", search("weather")],
    ["electron webview", search("electron webview")],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });
});
