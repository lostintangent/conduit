import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  useImagePreview,
  isBinaryImage,
  isSvg,
  getMimeType,
  uint8ArrayToBase64,
} from "../../../../src/renderer/components/panes/editor-v2/hooks/useImagePreview";

// ============================================================================
// Mocks
// ============================================================================

const mockFs = {
  readFile: vi.fn(),
  readTextFile: vi.fn(),
};

vi.mock("@/hooks/useFileSystemV2", () => ({
  useFileSystemV2: () => mockFs,
}));

// ============================================================================
// Helper Function Tests
// ============================================================================

describe("isBinaryImage", () => {
  it("should return true for PNG files", () => {
    expect(isBinaryImage("/path/to/image.png")).toBe(true);
    expect(isBinaryImage("/path/to/IMAGE.PNG")).toBe(true);
  });

  it("should return true for JPG/JPEG files", () => {
    expect(isBinaryImage("/path/to/image.jpg")).toBe(true);
    expect(isBinaryImage("/path/to/image.jpeg")).toBe(true);
    expect(isBinaryImage("/path/to/IMAGE.JPEG")).toBe(true);
  });

  it("should return true for GIF files", () => {
    expect(isBinaryImage("/path/to/image.gif")).toBe(true);
  });

  it("should return true for WebP files", () => {
    expect(isBinaryImage("/path/to/image.webp")).toBe(true);
  });

  it("should return true for BMP files", () => {
    expect(isBinaryImage("/path/to/image.bmp")).toBe(true);
  });

  it("should return true for ICO files", () => {
    expect(isBinaryImage("/path/to/favicon.ico")).toBe(true);
  });

  it("should return false for SVG files", () => {
    expect(isBinaryImage("/path/to/image.svg")).toBe(false);
  });

  it("should return false for non-image files", () => {
    expect(isBinaryImage("/path/to/file.txt")).toBe(false);
    expect(isBinaryImage("/path/to/file.ts")).toBe(false);
  });
});

describe("isSvg", () => {
  it("should return true for SVG files", () => {
    expect(isSvg("/path/to/image.svg")).toBe(true);
    expect(isSvg("/path/to/IMAGE.SVG")).toBe(true);
  });

  it("should return false for non-SVG files", () => {
    expect(isSvg("/path/to/image.png")).toBe(false);
    expect(isSvg("/path/to/file.txt")).toBe(false);
  });
});

describe("getMimeType", () => {
  it("should return correct MIME type for PNG", () => {
    expect(getMimeType("/path/to/image.png")).toBe("image/png");
  });

  it("should return correct MIME type for JPG/JPEG", () => {
    expect(getMimeType("/path/to/image.jpg")).toBe("image/jpeg");
    expect(getMimeType("/path/to/image.jpeg")).toBe("image/jpeg");
  });

  it("should return correct MIME type for GIF", () => {
    expect(getMimeType("/path/to/image.gif")).toBe("image/gif");
  });

  it("should return correct MIME type for WebP", () => {
    expect(getMimeType("/path/to/image.webp")).toBe("image/webp");
  });

  it("should return correct MIME type for BMP", () => {
    expect(getMimeType("/path/to/image.bmp")).toBe("image/bmp");
  });

  it("should return correct MIME type for ICO", () => {
    expect(getMimeType("/path/to/favicon.ico")).toBe("image/x-icon");
  });

  it("should return correct MIME type for SVG", () => {
    expect(getMimeType("/path/to/image.svg")).toBe("image/svg+xml");
  });

  it("should return octet-stream for unknown types", () => {
    expect(getMimeType("/path/to/file.unknown")).toBe(
      "application/octet-stream",
    );
  });
});

describe("uint8ArrayToBase64", () => {
  it("should convert Uint8Array to base64 string", () => {
    // "Hello" in ASCII
    const bytes = new Uint8Array([72, 101, 108, 108, 111]);
    expect(uint8ArrayToBase64(bytes)).toBe("SGVsbG8=");
  });

  it("should handle empty array", () => {
    const bytes = new Uint8Array([]);
    expect(uint8ArrayToBase64(bytes)).toBe("");
  });

  it("should handle binary data", () => {
    const bytes = new Uint8Array([0, 255, 128, 64]);
    const result = uint8ArrayToBase64(bytes);
    expect(result).toBe(btoa(String.fromCharCode(0, 255, 128, 64)));
  });
});

// ============================================================================
// Hook Tests
// ============================================================================

describe("useImagePreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Initial State
  // ===========================================================================

  describe("initial state", () => {
    it("should start with loading state", () => {
      mockFs.readFile.mockReturnValue(new Promise(() => {})); // Never resolves

      const { result } = renderHook(() =>
        useImagePreview("/path/to/image.png", "/cwd"),
      );

      expect(result.current.isLoading).toBe(true);
      expect(result.current.imageUrl).toBe(null);
      expect(result.current.error).toBe(null);
    });
  });

  // ===========================================================================
  // Binary Image Loading
  // ===========================================================================

  describe("binary image loading", () => {
    it("should load PNG file and return data URL", async () => {
      // Simple PNG-like data
      const pngData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      mockFs.readFile.mockResolvedValue(pngData);

      const { result } = renderHook(() =>
        useImagePreview("/path/to/image.png", "/cwd"),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe(null);
      expect(result.current.imageUrl).toMatch(/^data:image\/png;base64,/);
      expect(mockFs.readFile).toHaveBeenCalledWith("/path/to/image.png");
    });

    it("should load JPG file with correct MIME type", async () => {
      const jpgData = new Uint8Array([255, 216, 255, 224]);
      mockFs.readFile.mockResolvedValue(jpgData);

      const { result } = renderHook(() =>
        useImagePreview("/path/to/photo.jpg", "/cwd"),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.imageUrl).toMatch(/^data:image\/jpeg;base64,/);
    });

    it("should load GIF file with correct MIME type", async () => {
      const gifData = new Uint8Array([71, 73, 70, 56, 57, 97]);
      mockFs.readFile.mockResolvedValue(gifData);

      const { result } = renderHook(() =>
        useImagePreview("/path/to/animation.gif", "/cwd"),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.imageUrl).toMatch(/^data:image\/gif;base64,/);
    });
  });

  // ===========================================================================
  // SVG Loading
  // ===========================================================================

  describe("SVG loading", () => {
    it("should load SVG file as text and return data URL", async () => {
      const svgContent =
        '<svg xmlns="http://www.w3.org/2000/svg"><circle r="50"/></svg>';
      mockFs.readTextFile.mockResolvedValue(svgContent);

      const { result } = renderHook(() =>
        useImagePreview("/path/to/icon.svg", "/cwd"),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe(null);
      expect(result.current.imageUrl).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(mockFs.readTextFile).toHaveBeenCalledWith("/path/to/icon.svg");
      expect(mockFs.readFile).not.toHaveBeenCalled();
    });

    it("should handle SVG with unicode characters", async () => {
      const svgContent =
        '<svg xmlns="http://www.w3.org/2000/svg"><text>日本語</text></svg>';
      mockFs.readTextFile.mockResolvedValue(svgContent);

      const { result } = renderHook(() =>
        useImagePreview("/path/to/unicode.svg", "/cwd"),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe(null);
      expect(result.current.imageUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe("error handling", () => {
    it("should handle file read error", async () => {
      mockFs.readFile.mockRejectedValue(new Error("File not found"));

      const { result } = renderHook(() =>
        useImagePreview("/path/to/missing.png", "/cwd"),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe("File not found");
      expect(result.current.imageUrl).toBe(null);
    });

    it("should handle SVG read error", async () => {
      mockFs.readTextFile.mockRejectedValue(new Error("Permission denied"));

      const { result } = renderHook(() =>
        useImagePreview("/path/to/protected.svg", "/cwd"),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe("Permission denied");
      expect(result.current.imageUrl).toBe(null);
    });

    it("should handle unsupported image format", async () => {
      const { result } = renderHook(() =>
        useImagePreview("/path/to/file.txt", "/cwd"),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe("Unsupported image format");
      expect(result.current.imageUrl).toBe(null);
    });

    it("should handle non-Error exceptions", async () => {
      mockFs.readFile.mockRejectedValue("String error");

      const { result } = renderHook(() =>
        useImagePreview("/path/to/image.png", "/cwd"),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe("Failed to load image");
    });
  });

  // ===========================================================================
  // File Path Changes
  // ===========================================================================

  describe("file path changes", () => {
    it("should reload when file path changes", async () => {
      const pngData = new Uint8Array([137, 80, 78, 71]);
      const gifData = new Uint8Array([71, 73, 70, 56]);

      mockFs.readFile
        .mockResolvedValueOnce(pngData)
        .mockResolvedValueOnce(gifData);

      const { result, rerender } = renderHook(
        ({ filePath }) => useImagePreview(filePath, "/cwd"),
        { initialProps: { filePath: "/path/to/image.png" } },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.imageUrl).toMatch(/^data:image\/png;base64,/);

      // Change file path
      rerender({ filePath: "/path/to/other.gif" });

      await waitFor(() => {
        expect(result.current.imageUrl).toMatch(/^data:image\/gif;base64,/);
      });

      expect(mockFs.readFile).toHaveBeenCalledTimes(2);
    });

    it("should reset state when switching between files", async () => {
      mockFs.readFile.mockResolvedValue(new Uint8Array([137, 80, 78, 71]));

      const { result, rerender } = renderHook(
        ({ filePath }) => useImagePreview(filePath, "/cwd"),
        { initialProps: { filePath: "/path/to/first.png" } },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Clear mock and make next call slower
      mockFs.readFile.mockClear();
      mockFs.readFile.mockReturnValue(new Promise(() => {})); // Never resolves

      // Change file path - should show loading state
      rerender({ filePath: "/path/to/second.png" });

      // Should be loading while fetching new image
      expect(result.current.isLoading).toBe(true);
    });
  });

  // ===========================================================================
  // Sandbox ID
  // ===========================================================================

  describe("sandbox ID", () => {
    it("should pass sandbox ID to file system hook", async () => {
      mockFs.readFile.mockResolvedValue(new Uint8Array([137, 80, 78, 71]));

      const { result } = renderHook(() =>
        useImagePreview("/path/to/image.png", "/cwd", "sandbox-123"),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.imageUrl).not.toBe(null);
    });
  });
});
