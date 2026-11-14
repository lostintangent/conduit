import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const png = Buffer.from("png bytes");

vi.mock("electron", () => ({
  webContents: {
    fromId: () => ({ capturePage: async () => ({ toPNG: () => png }) }),
  },
}));

import service from "./service";

describe("browser service", () => {
  it("saves a screenshot of the page to a temporary PNG", async () => {
    const file = await service.saveScreenshot(1);

    expect(path.dirname(file)).toBe(tmpdir());
    expect(path.extname(file)).toBe(".png");
    expect(await fs.readFile(file)).toEqual(png);
    await fs.rm(file);
  });
});
