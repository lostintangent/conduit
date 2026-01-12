/**
 * Tests for binaryDetection utilities.
 *
 * These tests verify the heuristic-based binary content detection
 * used to prevent binary files from being displayed in editors.
 */

import { describe, it, expect } from "vitest";
import {
  hasUnicodeBOM,
  isBinaryContent,
} from "@/components/panes/editor-v2/utils/binaryDetection";

// =============================================================================
// hasUnicodeBOM Tests
// =============================================================================

describe("hasUnicodeBOM", () => {
  it("should return false for empty content", () => {
    expect(hasUnicodeBOM("")).toBe(false);
  });

  it("should return false for regular text", () => {
    expect(hasUnicodeBOM("Hello, world!")).toBe(false);
  });

  it("should detect UTF-8 BOM (0xFEFF)", () => {
    const utf8BOM = "\uFEFF";
    expect(hasUnicodeBOM(utf8BOM + "content")).toBe(true);
  });

  it("should detect UTF-16 BE BOM (0xFEFF)", () => {
    const utf16BEBOM = String.fromCharCode(0xfeff);
    expect(hasUnicodeBOM(utf16BEBOM + "content")).toBe(true);
  });

  it("should detect UTF-16 LE BOM (0xFFFE)", () => {
    const utf16LEBOM = String.fromCharCode(0xfffe);
    expect(hasUnicodeBOM(utf16LEBOM + "content")).toBe(true);
  });

  it("should return false for content starting with other characters", () => {
    expect(hasUnicodeBOM("A")).toBe(false);
    expect(hasUnicodeBOM("\n")).toBe(false);
    expect(hasUnicodeBOM(" ")).toBe(false);
  });
});

// =============================================================================
// isBinaryContent Tests
// =============================================================================

describe("isBinaryContent", () => {
  describe("text content", () => {
    it("should return false for empty content", () => {
      expect(isBinaryContent("")).toBe(false);
    });

    it("should return false for plain text", () => {
      expect(isBinaryContent("Hello, world!")).toBe(false);
    });

    it("should return false for text with newlines", () => {
      expect(isBinaryContent("Line 1\nLine 2\r\nLine 3")).toBe(false);
    });

    it("should return false for text with tabs", () => {
      expect(isBinaryContent("col1\tcol2\tcol3")).toBe(false);
    });

    it("should return false for source code", () => {
      const code = `function hello() {
  console.log("Hello, world!");
}`;
      expect(isBinaryContent(code)).toBe(false);
    });

    it("should return false for JSON", () => {
      const json = '{"key": "value", "number": 42}';
      expect(isBinaryContent(json)).toBe(false);
    });

    it("should return false for content with UTF-8 BOM", () => {
      const withBOM = "\uFEFFcontent after BOM";
      expect(isBinaryContent(withBOM)).toBe(false);
    });

    it("should return false for content with UTF-16 LE BOM", () => {
      const withBOM = String.fromCharCode(0xfffe) + "content";
      expect(isBinaryContent(withBOM)).toBe(false);
    });
  });

  describe("ANSI escape codes", () => {
    it("should return false for content with ANSI color codes", () => {
      // ESC[31m = red, ESC[0m = reset
      const ansiText = "\x1b[31mRed text\x1b[0m";
      expect(isBinaryContent(ansiText)).toBe(false);
    });

    it("should return false for content with ANSI cursor movement", () => {
      // ESC[2J = clear screen
      const ansiText = "\x1b[2JCleared";
      expect(isBinaryContent(ansiText)).toBe(false);
    });
  });

  describe("binary content", () => {
    it("should return true for content with null bytes", () => {
      expect(isBinaryContent("text\x00more")).toBe(true);
    });

    it("should return true for content with SOH (0x01)", () => {
      expect(isBinaryContent("text\x01more")).toBe(true);
    });

    it("should return true for content with STX (0x02)", () => {
      expect(isBinaryContent("text\x02more")).toBe(true);
    });

    it("should return true for content with BEL (0x07)", () => {
      expect(isBinaryContent("text\x07more")).toBe(true);
    });

    it("should return true for content with BS (0x08)", () => {
      expect(isBinaryContent("text\x08more")).toBe(true);
    });

    it("should return true for content with VT (0x0B)", () => {
      expect(isBinaryContent("text\x0Bmore")).toBe(true);
    });

    it("should return true for content with FF (0x0C)", () => {
      expect(isBinaryContent("text\x0Cmore")).toBe(true);
    });

    it("should return true for content with SO (0x0E)", () => {
      expect(isBinaryContent("text\x0Emore")).toBe(true);
    });

    it("should return true for content with control chars 0x0E-0x1A", () => {
      // SI (0x0F), DLE (0x10), SUB (0x1A)
      expect(isBinaryContent("text\x0Fmore")).toBe(true);
      expect(isBinaryContent("text\x10more")).toBe(true);
      expect(isBinaryContent("text\x1Amore")).toBe(true);
    });

    it("should return true for content with control chars 0x1C-0x1F", () => {
      // FS (0x1C), GS (0x1D), RS (0x1E), US (0x1F)
      expect(isBinaryContent("text\x1Cmore")).toBe(true);
      expect(isBinaryContent("text\x1Dmore")).toBe(true);
      expect(isBinaryContent("text\x1Emore")).toBe(true);
      expect(isBinaryContent("text\x1Fmore")).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should only check first 8192 characters", () => {
      // Binary byte after 8192 chars should not be detected
      const longText = "a".repeat(8192) + "\x00";
      expect(isBinaryContent(longText)).toBe(false);

      // Binary byte within first 8192 chars should be detected
      const binaryNearEnd = "a".repeat(8191) + "\x00";
      expect(isBinaryContent(binaryNearEnd)).toBe(true);
    });

    it("should detect binary at start of content", () => {
      expect(isBinaryContent("\x00text")).toBe(true);
    });

    it("should detect binary in middle of content", () => {
      expect(isBinaryContent("text\x00more")).toBe(true);
    });

    it("should handle Unicode content correctly", () => {
      expect(isBinaryContent("日本語テキスト")).toBe(false);
      expect(isBinaryContent("emoji: 🎉🚀")).toBe(false);
      expect(isBinaryContent("Ñoño español")).toBe(false);
    });

    it("should not flag DEL (0x7F) as binary", () => {
      expect(isBinaryContent("text\x7Fmore")).toBe(false);
    });
  });
});
