/**
 * Unit tests for URL detection logic in BrowserToolbar
 */

import { describe, expect, it } from "vitest";

/**
 * Helper function to simulate the URL detection logic from BrowserToolbar
 * This is extracted for testing purposes
 */
function detectUrlOrSearch(input: string): { isUrl: boolean; targetUrl: string } {
  const targetUrl = input.trim();

  // Check if the input looks like a URL or a search query
  const isUrl = (() => {
    // If it already has a protocol, it's a URL
    if (targetUrl.match(/^[a-z][a-z0-9+.-]*:\/\//i)) {
      return true;
    }

    // If it contains spaces, it's likely a search query
    if (targetUrl.includes(" ")) {
      return false;
    }

    // Check if it looks like a domain with a TLD
    const host = targetUrl.split("/")[0];
    const isLocalhost = host === "localhost" || host.startsWith("localhost:");

    if (isLocalhost) {
      return true;
    }

    // Check if it has a valid TLD (at least one dot followed by 2+ characters)
    // This matches domains like google.com, github.io, co.uk, etc.
    const hasTLD = /\.[a-z]{2,}$/i.test(host);

    return hasTLD;
  })();

  let finalUrl = targetUrl;

  if (!isUrl) {
    // Convert to DuckDuckGo search query
    finalUrl = `https://duckduckgo.com/?q=${encodeURIComponent(targetUrl)}`;
  } else if (!targetUrl.match(/^http(s)?:\/\//i)) {
    // Add protocol if missing for URLs
    const lowerTarget = targetUrl.toLowerCase();
    const host = lowerTarget.split("/")[0];
    const isLocalhost = host === "localhost" || host.startsWith("localhost:");
    const protocol = isLocalhost ? "http" : "https";
    finalUrl = `${protocol}://${targetUrl}`;
  }

  return { isUrl, targetUrl: finalUrl };
}

describe("URL Detection Logic", () => {
  describe("should detect URLs", () => {
    it("should recognize domains with TLDs", () => {
      const result = detectUrlOrSearch("google.com");
      expect(result.isUrl).toBe(true);
      expect(result.targetUrl).toBe("https://google.com");
    });

    it("should recognize domains with subdomains", () => {
      const result = detectUrlOrSearch("www.github.com");
      expect(result.isUrl).toBe(true);
      expect(result.targetUrl).toBe("https://www.github.com");
    });

    it("should recognize domains with paths", () => {
      const result = detectUrlOrSearch("github.com/lostintangent");
      expect(result.isUrl).toBe(true);
      expect(result.targetUrl).toBe("https://github.com/lostintangent");
    });

    it("should recognize localhost", () => {
      const result = detectUrlOrSearch("localhost");
      expect(result.isUrl).toBe(true);
      expect(result.targetUrl).toBe("http://localhost");
    });

    it("should recognize localhost with port", () => {
      const result = detectUrlOrSearch("localhost:3000");
      expect(result.isUrl).toBe(true);
      expect(result.targetUrl).toBe("http://localhost:3000");
    });

    it("should recognize URLs with protocols", () => {
      const result = detectUrlOrSearch("https://example.com");
      expect(result.isUrl).toBe(true);
      expect(result.targetUrl).toBe("https://example.com");
    });

    it("should recognize various TLDs", () => {
      const testCases = [
        "example.org",
        "example.net",
        "example.io",
        "example.dev",
        "example.co.uk",
      ];

      testCases.forEach((input) => {
        const result = detectUrlOrSearch(input);
        expect(result.isUrl).toBe(true);
        expect(result.targetUrl).toMatch(/^https:\/\//);
      });
    });
  });

  describe("should detect search queries", () => {
    it("should detect queries with spaces", () => {
      const result = detectUrlOrSearch("hello world");
      expect(result.isUrl).toBe(false);
      expect(result.targetUrl).toBe("https://duckduckgo.com/?q=hello%20world");
    });

    it("should detect single words without TLDs", () => {
      const result = detectUrlOrSearch("weather");
      expect(result.isUrl).toBe(false);
      expect(result.targetUrl).toBe("https://duckduckgo.com/?q=weather");
    });

    it("should detect phrases", () => {
      const result = detectUrlOrSearch("how to code");
      expect(result.isUrl).toBe(false);
      expect(result.targetUrl).toBe("https://duckduckgo.com/?q=how%20to%20code");
    });

    it("should detect queries without valid TLDs", () => {
      const result = detectUrlOrSearch("test");
      expect(result.isUrl).toBe(false);
      expect(result.targetUrl).toBe("https://duckduckgo.com/?q=test");
    });

    it("should properly encode special characters", () => {
      const result = detectUrlOrSearch("test & check");
      expect(result.isUrl).toBe(false);
      expect(result.targetUrl).toBe("https://duckduckgo.com/?q=test%20%26%20check");
    });
  });

  describe("edge cases", () => {
    it("should handle domains with multiple dots", () => {
      const result = detectUrlOrSearch("api.example.com");
      expect(result.isUrl).toBe(true);
      expect(result.targetUrl).toBe("https://api.example.com");
    });

    it("should handle URLs with query parameters", () => {
      const result = detectUrlOrSearch("example.com?query=test");
      expect(result.isUrl).toBe(true);
      expect(result.targetUrl).toBe("https://example.com?query=test");
    });

    it("should handle IP addresses as search queries (no TLD)", () => {
      const result = detectUrlOrSearch("192.168.1.1");
      expect(result.isUrl).toBe(false);
      expect(result.targetUrl).toContain("duckduckgo.com");
    });
  });
});
