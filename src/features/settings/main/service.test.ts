import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { nativeTheme } from "electron";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import service from "./service";

let home: string;
const { setDotfilesRepo } = vi.hoisted(() => ({
  setDotfilesRepo: vi.fn(async (_url?: string) => {}),
}));

vi.mock("electron", () => ({
  app: { getPath: () => home },
  nativeTheme: { themeSource: "system" },
}));
vi.mock("../../dotfiles/main", () => ({ setDotfilesRepo }));

beforeAll(async () => {
  home = await mkdtemp(path.join(tmpdir(), "conduit-settings-service-"));
  await mkdir(path.join(home, ".conduit"));
});

afterAll(() => rm(home, { recursive: true, force: true }));

it("moves the dotfiles repo only when a save sets it", async () => {
  const file = path.join(home, ".conduit", "settings.json");
  await writeFile(file, JSON.stringify({ dotfilesRepo: "me/dotfiles" }));
  expect(service.get().dotfilesRepo).toBe("me/dotfiles");

  // A pull through a symlinked settings.json changes the repo.
  await writeFile(file, JSON.stringify({ dotfilesRepo: "me/pulled" }));
  await service.update({ theme: "light" });
  expect(setDotfilesRepo).not.toHaveBeenCalled();

  await service.update({ dotfilesRepo: "me/chosen" });
  expect(setDotfilesRepo).toHaveBeenCalledWith("me/chosen");
});

it("has native menus and pages follow the theme it saves", async () => {
  await service.update({ theme: "light" });
  expect(nativeTheme.themeSource).toBe("light");

  // So does one edited into settings.json since
  const file = path.join(home, ".conduit", "settings.json");
  await writeFile(file, JSON.stringify({ theme: "dark" }));
  await service.update({ dotfilesRepo: "me/other" });
  expect(nativeTheme.themeSource).toBe("dark");
});
