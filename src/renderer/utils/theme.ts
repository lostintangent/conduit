import type { ThemeMode, ThemeOverrides } from "@shared/types";

export function resolveColor(variable: string): string {
  const property = variable.startsWith("--") ? variable : `--color-${variable}`;

  return getComputedStyle(document.documentElement)
    .getPropertyValue(property)
    .trim();
}

/**
 * Detect system theme preference
 */
export function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Resolve effective theme based on mode setting
 */
export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return getSystemTheme();
  }
  return mode;
}

/**
 * Apply theme to document
 */
export function applyTheme(mode: ThemeMode, overrides?: ThemeOverrides): void {
  const theme = resolveTheme(mode);

  // Set data-theme attribute for CSS to use
  document.documentElement.setAttribute("data-theme", theme);

  // Update color-scheme for native elements
  document.documentElement.style.colorScheme = theme;

  // Apply overrides if provided
  if (overrides) {
    const root = document.documentElement;
    if (overrides.surface)
      root.style.setProperty("--color-surface", overrides.surface);
    if (overrides.surfaceElevated)
      root.style.setProperty(
        "--color-surface-elevated",
        overrides.surfaceElevated
      );
    if (overrides.surfaceMuted)
      root.style.setProperty("--color-surface-muted", overrides.surfaceMuted);
    if (overrides.input)
      root.style.setProperty("--color-input", overrides.input);
    if (overrides.border)
      root.style.setProperty("--color-border", overrides.border);
    if (overrides.borderMuted)
      root.style.setProperty("--color-border-muted", overrides.borderMuted);
    if (overrides.foreground)
      root.style.setProperty("--color-foreground", overrides.foreground);
    if (overrides.foregroundInverse)
      root.style.setProperty(
        "--color-foreground-inverse",
        overrides.foregroundInverse
      );
    if (overrides.selection)
      root.style.setProperty("--color-selection", overrides.selection);
    if (overrides.accent)
      root.style.setProperty("--color-accent", overrides.accent);
  }
}

/**
 * Watch for system theme changes
 */
export function watchSystemTheme(
  mode: ThemeMode,
  callback: (theme: "light" | "dark") => void
): () => void {
  if (mode !== "system") {
    return () => {};
  }

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (e: MediaQueryListEvent) => {
    callback(e.matches ? "dark" : "light");
  };

  mediaQuery.addEventListener("change", handler);
  return () => mediaQuery.removeEventListener("change", handler);
}

const hashedColorCache = new Map<string, string>();

const hashString = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
};

export type HashedColorOptions = {
  saturation?: number;
  lightnessRange?: [number, number];
  cache?: Map<string, string>;
};

export const getHashedColor = (
  key: string,
  options: HashedColorOptions = {}
): string => {
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
};
