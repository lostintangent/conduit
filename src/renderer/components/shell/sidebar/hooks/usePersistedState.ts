/**
 * usePersistedState - A hook for state that persists to localStorage
 *
 * Provides a useState-like interface with automatic localStorage persistence.
 * Includes validation to ensure stored values are valid before using them.
 *
 * @example
 * ```tsx
 * const [theme, setTheme] = usePersistedState<"light" | "dark">(
 *   "app-theme",
 *   "dark",
 *   (v) => v === "light" || v === "dark"
 * );
 * ```
 */

import { useCallback, useState } from "react";

/**
 * Hook for managing state that persists to localStorage.
 *
 * @param key - The localStorage key to use
 * @param defaultValue - Default value if no valid stored value exists
 * @param validate - Optional validation function for stored values
 * @returns Tuple of [value, setValue] similar to useState
 */
export function usePersistedState<T extends string>(
  key: string,
  defaultValue: T,
  validate?: (value: string) => value is T,
): [T, (value: T) => void] {
  const [value, setValueInternal] = useState<T>(() => {
    const saved = localStorage.getItem(key);
    if (saved !== null) {
      // If validator provided, use it; otherwise accept any string as T
      if (validate) {
        return validate(saved) ? saved : defaultValue;
      }
      return saved as T;
    }
    return defaultValue;
  });

  const setValue = useCallback(
    (newValue: T) => {
      setValueInternal(newValue);
      localStorage.setItem(key, newValue);
    },
    [key],
  );

  return [value, setValue];
}
