/**
 * ImagePreview - Displays binary images and SVG files.
 *
 * Used for previewing image files in the editor pane.
 * Supports common image formats (PNG, JPG, GIF, WebP, BMP, ICO) and SVG.
 *
 * For binary images, displays the image centered.
 * For SVG files, displays using an img tag with data URL for consistent rendering.
 *
 * @example
 * ```tsx
 * <ImagePreview filePath="/path/to/image.png" sandboxId={sandboxId} />
 * ```
 */

import { useFileSystemV2 } from "@/hooks/useFileSystemV2";
import { useEffect, useState } from "react";

export interface ImagePreviewProps {
  /** Full path to the image file */
  filePath: string;
  /** Working directory for file operations */
  cwd: string;
  /** Sandbox/VM ID for remote operations (optional) */
  sandboxId?: string;
}

/** Image extensions that are binary (not text-based) */
const BINARY_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
];

/**
 * Check if a file extension is a binary image format.
 */
function isBinaryImage(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return BINARY_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Check if a file is an SVG.
 */
function isSvg(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".svg");
}

/**
 * Get MIME type for an image file.
 */
function getMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

/**
 * Convert a Uint8Array to a base64 string.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Image preview component.
 */
export function ImagePreview({ filePath, cwd, sandboxId }: ImagePreviewProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fs = useFileSystemV2(cwd, sandboxId);

  // Load image content
  useEffect(() => {
    let cancelled = false;

    const loadImage = async () => {
      setIsLoading(true);
      setError(null);
      setImageUrl(null);

      try {
        const mimeType = getMimeType(filePath);

        if (isSvg(filePath)) {
          // SVG: read as text and encode as data URL
          // Using data URL ensures consistent rendering regardless of SVG attributes
          const content = await fs.readTextFile(filePath);
          if (!cancelled) {
            const base64 = btoa(unescape(encodeURIComponent(content)));
            setImageUrl(`data:${mimeType};base64,${base64}`);
          }
        } else if (isBinaryImage(filePath)) {
          // Binary image: read as Uint8Array and convert to data URL
          const data = await fs.readFile(filePath);
          if (!cancelled) {
            const base64 = uint8ArrayToBase64(data);
            setImageUrl(`data:${mimeType};base64,${base64}`);
          }
        } else {
          throw new Error("Unsupported image format");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load image");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadImage();

    return () => {
      cancelled = true;
    };
  }, [filePath, fs]);

  // Render loading state
  if (isLoading) {
    return (
      <div
        className="h-full w-full flex items-center justify-center text-muted-foreground"
        data-testid="image-preview-loading"
      >
        Loading image...
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div
        className="h-full w-full flex items-center justify-center text-destructive"
        data-testid="image-preview-error"
      >
        {error}
      </div>
    );
  }

  // Render image (works for both binary and SVG)
  if (imageUrl) {
    return (
      <div
        className="h-full w-full overflow-auto p-4 flex items-center justify-center bg-[repeating-conic-gradient(hsl(var(--muted))_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]"
        data-testid="image-preview"
      >
        <img
          src={imageUrl}
          alt={filePath.split("/").pop() ?? "Image"}
          className="max-w-full max-h-full object-contain"
        />
      </div>
    );
  }

  // Fallback (shouldn't happen)
  return (
    <div
      className="h-full w-full flex items-center justify-center text-muted-foreground"
      data-testid="image-preview-empty"
    >
      No image to display
    </div>
  );
}
