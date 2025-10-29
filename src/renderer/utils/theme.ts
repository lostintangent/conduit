export function resolveColor(variable: string): string {
  const property = variable.startsWith("--") ? variable : `--color-${variable}`;

  return getComputedStyle(document.documentElement)
    .getPropertyValue(property)
    .trim();
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
  const [lightnessMinRaw, lightnessMaxRaw] =
    options.lightnessRange ?? [38, 55];
  const lightnessMin = Math.min(lightnessMinRaw, lightnessMaxRaw);
  const lightnessMax =
    lightnessMin === lightnessMaxRaw ? lightnessMin + 1 : Math.max(lightnessMinRaw, lightnessMaxRaw);
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
