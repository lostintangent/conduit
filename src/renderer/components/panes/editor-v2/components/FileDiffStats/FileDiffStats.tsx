/**
 * FileDiffStats - Displays lines added/removed for a file.
 *
 * Self-contained component that automatically gets stats from context.
 * Just provide the file path and it handles the rest.
 *
 * @example
 * ```tsx
 * // Basic usage (requires FileDiffStatsProvider ancestor)
 * <FileDiffStats filePath="src/app.tsx" />
 *
 * // With unseen indicator (bolds the stats)
 * <FileDiffStats filePath="src/app.tsx" isUnseen={true} />
 * ```
 */

import { memo, useEffect, useRef, useState } from "react";
import { cn } from "@/utils";
import { useFileDiffStats } from "./FileDiffStatsContext";

/** Duration the stats stay bright before fading (ms) */
const FLASH_BRIGHT_DURATION_MS = 2000;
/** Duration of the fade-out transition (ms) */
const FADE_OUT_DURATION_MS = 2000;

export interface FileDiffStatsProps {
  /** Relative path to the file */
  filePath: string;
  /** Additional CSS classes */
  className?: string;
  /** Whether to show stats even when both added and removed are 0 */
  showZero?: boolean;
  /** Whether the file has unseen changes (bolds the stats) */
  isUnseen?: boolean;
}

/** Flash animation states */
type FlashState = "idle" | "bright" | "fading";

/**
 * Displays diff statistics (+X -Y) for a file.
 *
 * Automatically fetches stats from FileDiffStatsContext.
 * Returns null if no stats available or if both values are 0 (unless showZero is true).
 *
 * Features:
 * - Green text for additions (+X), red for deletions (-Y)
 * - Flashes brighter for 2s when stats change, then fades back
 * - Supports isUnseen to bold text for unread changes
 */
export const FileDiffStats = memo(function FileDiffStats({
  filePath,
  className,
  showZero = false,
  isUnseen = false,
}: FileDiffStatsProps) {
  const stats = useFileDiffStats(filePath);
  const [flashState, setFlashState] = useState<FlashState>("idle");
  const prevStatsRef = useRef<{ added: number; removed: number } | null>(null);
  const brightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect stat changes and trigger flash effect
  useEffect(() => {
    if (!stats) {
      prevStatsRef.current = null;
      return;
    }

    const prevStats = prevStatsRef.current;

    // Only flash if stats actually changed (not on initial load)
    if (
      prevStats !== null &&
      (prevStats.added !== stats.added || prevStats.removed !== stats.removed)
    ) {
      // Clear any existing timeouts
      if (brightTimeoutRef.current) {
        clearTimeout(brightTimeoutRef.current);
        brightTimeoutRef.current = null;
      }
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
        fadeTimeoutRef.current = null;
      }

      // Start bright phase
      setFlashState("bright");

      // After bright duration, start fading
      brightTimeoutRef.current = setTimeout(() => {
        setFlashState("fading");
        brightTimeoutRef.current = null;

        // After fade transition completes, return to idle
        fadeTimeoutRef.current = setTimeout(() => {
          setFlashState("idle");
          fadeTimeoutRef.current = null;
        }, FADE_OUT_DURATION_MS);
      }, FLASH_BRIGHT_DURATION_MS);
    }

    // Update ref for next comparison
    prevStatsRef.current = { added: stats.added, removed: stats.removed };
  }, [stats?.added, stats?.removed]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      if (brightTimeoutRef.current) {
        clearTimeout(brightTimeoutRef.current);
      }
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
      }
    };
  }, []);

  // Don't render if no stats available
  if (!stats) {
    return null;
  }

  // Don't render if both are 0 (unless showZero is true)
  if (!showZero && stats.added === 0 && stats.removed === 0) {
    return null;
  }

  // Flash animation: opacity 100% when bright, 60% otherwise
  const isBright = flashState === "bright";
  const isFading = flashState === "fading";
  const opacityClass = isBright ? "opacity-100" : "opacity-60";

  // Transition for flash animation and font-weight changes
  // Use will-change and transform to ensure GPU acceleration for smooth animation
  const fontWeightTransition = "font-weight 0.3s ease";
  const transitionStyle: React.CSSProperties = isBright
    ? {
        transition: `opacity 0.15s ease-out, ${fontWeightTransition}`,
        willChange: "opacity",
        transform: "translateZ(0)",
      }
    : isFading
      ? {
          transition: `opacity ${FADE_OUT_DURATION_MS}ms ease-in, ${fontWeightTransition}`,
          willChange: "opacity",
          transform: "translateZ(0)",
        }
      : { transition: fontWeightTransition };

  return (
    <span
      className={cn(
        "flex-shrink-0 text-[10px] font-mono",
        opacityClass,
        isUnseen && "font-extrabold",
        className,
      )}
      style={transitionStyle}
      title={`${stats.added} additions, ${stats.removed} deletions`}
    >
      {stats.added > 0 && (
        <span className="text-green-500">+{stats.added}</span>
      )}
      {stats.added > 0 && stats.removed > 0 && " "}
      {stats.removed > 0 && (
        <span className="text-red-500">-{stats.removed}</span>
      )}
    </span>
  );
});
