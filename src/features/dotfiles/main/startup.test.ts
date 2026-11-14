import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import syncDotfiles from "./startup";

let home: string;

vi.mock("electron", () => ({ app: { getPath: () => home } }));
vi.mock("./index", () => ({ initializeRepo: async () => "me/dotfiles" }));

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "conduit-dotfiles-"));
  await mkdir(path.join(home, ".conduit"));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(home, { recursive: true, force: true });
});

it("starts when settings.json can't take the repo it found", async () => {
  const file = path.join(home, ".conduit", "settings.json");
  await writeFile(file, "{ not json");

  await expect(syncDotfiles()).resolves.toBeUndefined();
  expect(await readFile(file, "utf-8")).toBe("{ not json");
});
