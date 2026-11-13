import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A reusable no-op function for optional callbacks.
 * Use this instead of inline `() => {}` for consistency and to avoid
 * creating new function instances on every render.
 */
export const noop = (): void => {};

export function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Path utilities for cross-platform path handling
export { normalizePathForKey, pathsEqual } from "./pathUtils";
