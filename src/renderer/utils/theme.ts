import type { ThemeMode, ThemeOverrides } from "@features/settings/model";

export function resolveColor(variable: string): string {
  const property = variable.startsWith("--") ? variable : `--color-${variable}`;

  return getComputedStyle(document.documentElement)
    .getPropertyValue(property)
    .trim();
}

/**
 * Resolve effective theme based on user mode setting
 */
export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return mode;
}

/**
 * Apply theme to document
 */
export function applyTheme(mode: ThemeMode, overrides?: ThemeOverrides): void {
  const theme = resolveTheme(mode);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  const root = document.documentElement;

  // Helper to apply or clear an override
  const applyOverride = (property: string, value?: string) => {
    if (value) {
      root.style.setProperty(property, value);
    } else {
      root.style.removeProperty(property);
    }
  };

  // Apply or clear each override
  // Using removeProperty allows the CSS-defined value to take effect
  applyOverride("--color-input", overrides?.input);
  applyOverride("--color-border", overrides?.border);
  applyOverride("--color-foreground", overrides?.foreground);
  applyOverride("--color-selection", overrides?.selection);
  applyOverride("--color-accent", overrides?.accent);
  applyOverride("--color-background", overrides?.background);
  applyOverride("--color-elevated", overrides?.elevated);
}

/**
 * Watch for system theme changes
 */
export function watchSystemTheme(
  mode: ThemeMode,
  callback: (theme: "light" | "dark") => void,
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

/**
 * Watch for app theme changes (class/attribute changes on document element)
 */
export function watchAppTheme(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme", "style"],
  });
  return () => observer.disconnect();
}
