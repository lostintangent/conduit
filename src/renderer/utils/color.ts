/**
 * Color manipulation utilities.
 * Provides functions for parsing colors and calculating luminance.
 */

// =============================================================================
// Types
// =============================================================================

export interface RGB {
  r: number;
  g: number;
  b: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Default luminance threshold for light/dark classification */
export const DEFAULT_LUMINANCE_THRESHOLD = 0.5;

// =============================================================================
// Parsing
// =============================================================================

/**
 * Parse a hex color string to RGB components.
 * Supports both 3-char (#RGB) and 6-char (#RRGGBB) formats.
 *
 * @param hex - Hex color string (with or without # prefix)
 * @returns RGB object or null if invalid
 *
 * @example
 * parseHexColor("#fff")     // { r: 255, g: 255, b: 255 }
 * parseHexColor("1a1a1a")   // { r: 26, g: 26, b: 26 }
 * parseHexColor("invalid")  // null
 */
export function parseHexColor(hex: string): RGB | null {
  const cleanHex = hex.replace(/^#/, "");

  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16);
    const g = parseInt(cleanHex[1] + cleanHex[1], 16);
    const b = parseInt(cleanHex[2] + cleanHex[2], 16);
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b };
  }

  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b };
  }

  return null;
}

// =============================================================================
// Luminance
// =============================================================================

/**
 * Convert an sRGB component (0-255) to linear RGB (0-1).
 * Used for accurate luminance calculation per WCAG 2.1.
 */
function srgbToLinear(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/**
 * Calculate relative luminance of a color.
 * Returns a value from 0 (black) to 1 (white).
 * Uses the WCAG 2.1 luminance formula.
 *
 * @param hex - Hex color string
 * @param fallback - Value to return if hex is invalid (default: 0.5)
 * @returns Relative luminance (0-1)
 *
 * @example
 * computeLuminance("#000000")  // 0
 * computeLuminance("#ffffff")  // 1
 * computeLuminance("#1a1a1a")  // ~0.01
 */
export function computeLuminance(hex: string, fallback = 0.5): number {
  const rgb = parseHexColor(hex);
  if (!rgb) return fallback;

  const rLin = srgbToLinear(rgb.r);
  const gLin = srgbToLinear(rgb.g);
  const bLin = srgbToLinear(rgb.b);

  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * Determine if a color is "light" (luminance above threshold).
 * Useful for choosing contrasting foreground colors.
 *
 * @param hex - Hex color string
 * @param threshold - Luminance threshold (default: 0.5)
 * @returns True if the color is light
 *
 * @example
 * isLightColor("#ffffff")  // true
 * isLightColor("#000000")  // false
 * isLightColor("#808080")  // depends on threshold
 */
export function isLightColor(
  hex: string,
  threshold = DEFAULT_LUMINANCE_THRESHOLD,
): boolean {
  return computeLuminance(hex, threshold) > threshold;
}

// =============================================================================
// Hashed Colors
// =============================================================================

const hashedColorCache = new Map<string, string>();

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export type HashedColorOptions = {
  saturation?: number;
  lightnessRange?: [number, number];
  cache?: Map<string, string>;
};

/**
 * Generate a deterministic HSL color from a string key.
 * Useful for assigning consistent colors to dynamic values (e.g., user IDs, branch names).
 *
 * @param key - String to hash into a color
 * @param options - Optional saturation, lightness range, and cache
 * @returns HSL color string
 *
 * @example
 * getHashedColor("user-123")  // "hsl(42, 65%, 45%)"
 * getHashedColor("user-123")  // same color (cached)
 */
export function getHashedColor(
  key: string,
  options: HashedColorOptions = {},
): string {
  const saturation = options.saturation ?? 65;
  const [lightnessMinRaw, lightnessMaxRaw] = options.lightnessRange ?? [38, 55];
  const lightnessMin = Math.min(lightnessMinRaw, lightnessMaxRaw);
  const lightnessMax =
    lightnessMin === lightnessMaxRaw
      ? lightnessMin + 1
      : Math.max(lightnessMinRaw, lightnessMaxRaw);
  const cacheStore = options.cache ?? hashedColorCache;

  const cacheKey = `${key}::${saturation}:${lightnessMin}:${lightnessMax}`;
  const cached = cacheStore.get(cacheKey);
  if (cached) {
    return cached;
  }

  const hash = Math.abs(hashString(key));
  const hue = hash % 360;
  const lightnessRange = lightnessMax - lightnessMin;
  const lightness = lightnessMin + (hash % lightnessRange);

  const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  cacheStore.set(cacheKey, color);
  return color;
}
