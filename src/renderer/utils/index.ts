import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Path utilities for cross-platform path handling
export {
  isCaseInsensitiveFs,
  normalizePathForKey,
  pathsEqual,
} from "./pathUtils";
