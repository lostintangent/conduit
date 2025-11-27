import path from "node:path";

export const normalizeCwd = (raw: string | null): string | null => {
  if (!raw) {
    return null;
  }

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }

  const sanitized = decoded.split("\u0007").join("").trim();
  if (!sanitized) {
    return null;
  }

  try {
    return path.normalize(sanitized);
  } catch {
    return sanitized;
  }
};
