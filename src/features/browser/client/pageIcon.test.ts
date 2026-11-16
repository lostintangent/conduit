import { describe, expect, it } from "vitest";
import { classifyIcon, pickIcon } from "./pageIcon";

type Color = [red: number, green: number, blue: number, alpha: number];

const CLEAR: Color = [0, 0, 0, 0];
const INK: Color = [36, 41, 47, 255];
const WHITE: Color = [255, 255, 255, 255];

/** A 32px icon, colored pixel by pixel */
function icon(colorAt: (x: number, y: number) => Color) {
  const pixels = new Uint8ClampedArray(32 * 32 * 4);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) pixels.set(colorAt(x, y), (y * 32 + x) * 4);
  }
  return pixels;
}

const fromMiddle = (x: number, y: number) => Math.hypot(x - 15.5, y - 15.5);

/** Like GitHub's: a disc with a cat cut out of it, and a soft edge */
const githubMark = (ink: Color) =>
  icon((x, y) => {
    const distance = fromMiddle(x, y);
    if (distance > 16 || (distance < 9 && y > 8)) return CLEAR;
    if (distance > 15) return [ink[0], ink[1], ink[2], 128];
    return ink;
  });

describe("classifyIcon", () => {
  it("makes a template of one gray shade on a clear ground, like GitHub's mark in either theme", () => {
    expect(classifyIcon(githubMark(INK))).toBe("template");
    expect(classifyIcon(githubMark(WHITE))).toBe("template");
  });

  it("keeps the colors of an icon with two shades, colors, or little clear ground", () => {
    // Vercel's white triangle on its dark disc
    const vercel = icon((x, y) => {
      if (fromMiddle(x, y) > 16) return CLEAR;
      return y > 9 && y < 22 && Math.abs(x - 15.5) < (y - 9) / 1.5
        ? WHITE
        : INK;
    });
    // React's cyan rings
    const react = icon((x, y) =>
      Math.abs(fromMiddle(x, y) - 12) < 2 ? [97, 218, 251, 255] : CLEAR,
    );
    // Bun's dark eyes on its cream bun
    const bun = icon((x, y) => {
      if (fromMiddle(x, y) > 14) return CLEAR;
      return Math.hypot(Math.abs(x - 15.5) - 5, y - 14) < 2
        ? [0, 0, 0, 255]
        : [251, 240, 223, 255];
    });
    // Wikipedia's black W on its white tile
    const wikipedia = icon((x, y) => ((x + y) % 8 < 2 ? INK : WHITE));

    expect(classifyIcon(vercel)).toBe("color");
    expect(classifyIcon(react)).toBe("color");
    expect(classifyIcon(bun)).toBe("color");
    expect(classifyIcon(wikipedia)).toBe("color");
  });

  it("finds nothing in an icon that's all clear", () => {
    expect(classifyIcon(icon(() => CLEAR))).toBe("blank");
  });
});

describe("pickIcon", () => {
  const raster = (width: number) => ({ width, isVector: false });

  it("picks one in vectors, then the smallest at least 32px wide, then the largest", () => {
    const vector = { width: 0, isVector: true };
    expect(pickIcon([raster(16), vector, raster(64)])).toBe(vector);
    expect(pickIcon([raster(192), raster(16), raster(48)])).toEqual(raster(48));
    expect(pickIcon([raster(24), raster(16)])).toEqual(raster(24));
    expect(pickIcon([])).toBeUndefined();
  });
});
