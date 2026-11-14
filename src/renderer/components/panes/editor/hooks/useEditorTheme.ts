/**
 * useEditorTheme - Hook to get Monaco editor theme from user settings.
 *
 * Reads the user's theme preference and returns the appropriate Monaco
 * theme name. Supports system theme detection and reacts to changes.
 *
 * @returns Monaco theme name ("vs" or "vs-dark")
 */

import { useState, useEffect } from "react";
import { useSelector } from "@tanstack/react-store";
import { userSettingsAtom } from "@/store/atoms";
import { resolveTheme, watchSystemTheme } from "@/utils/theme";

/**
 * Hook to get the Monaco editor theme based on user settings.
 *
 * Handles:
 * - Light/dark mode user preference
 * - System theme detection when mode is "system"
 * - Reactive updates when system theme changes
 *
 * @returns Monaco theme name ("vs" or "vs-dark")
 */
export function useEditorTheme(): string {
  const { theme: themeMode } = useSelector(userSettingsAtom);

  // Get initial resolved theme
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>
    resolveTheme(themeMode),
  );

  // Watch for system theme changes when in system mode
  useEffect(() => {
    // Update immediately when theme mode changes
    setResolvedTheme(resolveTheme(themeMode));

    // Set up system theme watcher if needed
    const cleanup = watchSystemTheme(themeMode, (newTheme) => {
      setResolvedTheme(newTheme);
    });

    return cleanup;
  }, [themeMode]);

  // Map resolved theme to Monaco built-in theme name
  return resolvedTheme === "light" ? "vs" : "vs-dark";
}
