/**
 * useImagePreview Hook
 *
 * Loads and converts image files to data URLs for display in the editor.
 * Handles both binary images (PNG, JPG, etc.) and SVG files.
 *
 * @example
 * ```tsx
 * function ImageViewer({ filePath, cwd }: Props) {
 *   const { imageUrl, isLoading, error } = useImagePreview(filePath, cwd);
 *
 *   if (isLoading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error}</div>;
 *   return <img src={imageUrl} />;
 * }
 * ```
 */

import { useFileSystemV2 } from "@features/files/components/useFileSystemV2";
import { useEffect, useState } from "react";

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
export function isBinaryImage(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return BINARY_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Check if a file is an SVG.
 */
export function isSvg(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".svg");
}

/**
 * Check if a file is an image that can be previewed.
 */
export function isImageFile(filePath: string): boolean {
  return isBinaryImage(filePath) || isSvg(filePath);
}

/**
 * Get MIME type for an image file.
 */
export function getMimeType(filePath: string): string {
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
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Result of the useImagePreview hook.
 */
export interface UseImagePreviewResult {
  /** Data URL for the image, or null if not loaded */
  imageUrl: string | null;
  /** Whether the image is currently loading */
  isLoading: boolean;
  /** Error message if loading failed, or null */
  error: string | null;
}

/**
 * Hook to load and convert an image file to a data URL.
 *
 * @param filePath - Absolute path to the image file
 * @param cwd - Working directory for file operations
 * @returns The image URL, loading state, and any error
 */
export function useImagePreview(
  filePath: string,
  cwd: string,
): UseImagePreviewResult {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fs = useFileSystemV2(cwd);

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

  return { imageUrl, isLoading, error };
}
