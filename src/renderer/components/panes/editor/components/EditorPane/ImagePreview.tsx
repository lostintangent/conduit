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
 * <ImagePreview filePath="/path/to/image.png" />
 * ```
 */

import { useImagePreview } from "../../hooks/useImagePreview";

export interface ImagePreviewProps {
  /** Full path to the image file */
  filePath: string;
}

/**
 * Image preview component.
 */
export function ImagePreview({ filePath }: ImagePreviewProps) {
  const { imageUrl, isLoading, error } = useImagePreview(filePath);

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
