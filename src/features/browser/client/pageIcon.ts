import type { PageIcon } from "@shared/types/panes";

/** Past twice the 14px an icon shows at, so it stays sharp */
const ICON_SIZE = 32;

/**
 * Below `clearAlpha` a pixel is clear, and from `solidAlpha` it's solid. A
 * template has more than `clearGround` of its pixels clear, and more than
 * `oneShade` of its solid ones in one gray, within `graySpread` of gray and
 * `shadeSpread` of the icon's middle shade.
 */
const TEMPLATE = {
  clearAlpha: 32,
  solidAlpha: 192,
  clearGround: 0.2,
  oneShade: 0.95,
  graySpread: 16,
  shadeSpread: 48,
};

type DecodedIcon = {
  image: HTMLImageElement;
  width: number;
  isVector: boolean;
};

/**
 * The icon to show for a page, from those it links to, or none when none of
 * them load. It's drawn at 32px, small enough to save with the workspace, and
 * checked once for whether it's a template.
 */
export async function loadPageIcon(
  webContentsId: number,
  urls: string[],
): Promise<PageIcon | undefined> {
  // Only main can fetch them, with the page's session. A data URL is already
  // here.
  const fetched = await window.conduit.browser.fetchIcons(webContentsId, urls);
  const sources = [
    ...urls.filter((url) => url.startsWith("data:image/")),
    ...fetched,
  ];
  const icons = await Promise.all(sources.map(decodeIcon));
  const icon = pickIcon(icons.filter((icon) => icon !== undefined));
  return icon && drawIcon(icon.image);
}

async function decodeIcon(src: string): Promise<DecodedIcon | undefined> {
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
  } catch {
    return;
  }
  return {
    image,
    width: image.naturalWidth,
    isVector: src.startsWith("data:image/svg+xml"),
  };
}

/**
 * The icon that draws best at 32px: one in vectors, or else the smallest
 * that's at least that wide, or else the largest.
 */
export function pickIcon<T extends { width: number; isVector: boolean }>(
  icons: T[],
): T | undefined {
  const bySize = [...icons].sort((a, b) => a.width - b.width);
  return (
    icons.find((icon) => icon.isVector) ??
    bySize.find((icon) => icon.width >= ICON_SIZE) ??
    bySize[bySize.length - 1]
  );
}

function drawIcon(image: HTMLImageElement): PageIcon | undefined {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = ICON_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;

  // Centered in the square. An SVG without a size of its own fills it.
  const width = image.naturalWidth || ICON_SIZE;
  const height = image.naturalHeight || ICON_SIZE;
  const scale = ICON_SIZE / Math.max(width, height);
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    (ICON_SIZE - width * scale) / 2,
    (ICON_SIZE - height * scale) / 2,
    width * scale,
    height * scale,
  );

  const kind = classifyIcon(
    context.getImageData(0, 0, ICON_SIZE, ICON_SIZE).data,
  );
  if (kind === "blank") return;
  return { src: canvas.toDataURL("image/png"), template: kind === "template" };
}

/**
 * Whether an icon, as a canvas's RGBA pixels, shows nothing, or is a
 * template: a single gray shade on a clear ground, like GitHub's mark, which
 * vanishes on a tab of the same shade unless it's drawn in the tab's text
 * color. An icon with colors, with more than one shade like Vercel's white
 * triangle on its dark disc, or with little clear ground like Wikipedia's
 * tile, keeps its own colors. Edges blend with what's behind them, so only
 * solid pixels count toward its shades.
 */
export function classifyIcon(
  pixels: Uint8ClampedArray,
): "blank" | "template" | "color" {
  const total = pixels.length / 4;
  let clear = 0;
  let solid = 0;
  const grays: number[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    if (alpha < TEMPLATE.clearAlpha) {
      clear++;
      continue;
    }
    if (alpha < TEMPLATE.solidAlpha) continue;

    solid++;
    const channels = [pixels[i], pixels[i + 1], pixels[i + 2]];
    if (Math.max(...channels) - Math.min(...channels) <= TEMPLATE.graySpread) {
      grays.push((channels[0] + channels[1] + channels[2]) / 3);
    }
  }

  if (clear === total) return "blank";
  if (clear / total <= TEMPLATE.clearGround || solid === 0) return "color";

  grays.sort((a, b) => a - b);
  const middle = grays[Math.floor(grays.length / 2)];
  const inShade = grays.filter(
    (gray) => Math.abs(gray - middle) <= TEMPLATE.shadeSpread,
  ).length;
  return inShade / solid > TEMPLATE.oneShade ? "template" : "color";
}
