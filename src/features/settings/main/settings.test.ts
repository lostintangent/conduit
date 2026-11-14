import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openSettings } from "./settings";

vi.mock("electron", () => ({ app: {} }));

describe("settings", () => {
  let home: string;
  let file: string;
  let settings: ReturnType<typeof openSettings>;
  const stops: (() => void)[] = [];

  const onDisk = async () => JSON.parse(await readFile(file, "utf-8"));

  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), "conduit-settings-"));
    await mkdir(path.join(home, ".conduit"));
    file = path.join(home, ".conduit", "settings.json");
    settings = openSettings(() => home);
  });

  afterEach(async () => {
    stops.splice(0).forEach((stop) => stop());
    await rm(home, { recursive: true, force: true });
  });

  it("starts from the defaults and the home directory", () => {
    expect(settings.get()).toMatchObject({
      showTerminalRuler: false,
      terminalFontSize: 13,
      homeDirectory: home,
    });
  });

  it("saves only what differs from the defaults, for the next launch", async () => {
    await settings.update(() => ({ showTerminalRuler: true, theme: "dark" }));

    expect(await onDisk()).toEqual({ showTerminalRuler: true });
    expect(openSettings(() => home).get().showTerminalRuler).toBe(true);
  });

  it("runs writes one at a time, so none is lost", async () => {
    const add = (url: string) =>
      settings.update(({ urlHistory }) => ({
        urlHistory: [url, ...urlHistory],
      }));

    await Promise.all([add("a.com"), add("b.com"), add("c.com")]);

    expect((await onDisk()).urlHistory).toEqual(["c.com", "b.com", "a.com"]);
  });

  it("rejects a write that fails, and keeps the settings it had", async () => {
    await rm(path.join(home, ".conduit"), { recursive: true });

    await expect(
      settings.update(() => ({ showTerminalRuler: true })),
    ).rejects.toThrow("ENOENT");
    expect(settings.get().showTerminalRuler).toBe(false);
  });

  it("keeps an edit made on disk when it next writes", async () => {
    settings.get();
    await writeFile(file, JSON.stringify({ theme: "light" }));

    await settings.update(() => ({ showTerminalRuler: true }));

    expect(await onDisk()).toEqual({ theme: "light", showTerminalRuler: true });
  });

  it("doesn't count its own writes as edits", async () => {
    const changed = vi.fn();
    stops.push(settings.watch(changed));

    await settings.update(() => ({ theme: "light" }));
    await settings.update(() => ({ showTerminalRuler: true }));

    expect(changed).not.toHaveBeenCalled();
  });

  it("keeps its settings when the file is deleted", async () => {
    await writeFile(file, JSON.stringify({ dotfilesRepo: "me/dotfiles" }));
    settings.get();
    await rm(file);

    await settings.update(() => ({ theme: "light" }));

    expect(await onDisk()).toEqual({
      dotfilesRepo: "me/dotfiles",
      theme: "light",
    });
  });

  it("won't overwrite a file that doesn't parse", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await writeFile(file, '{ "theme": "light", }');

    expect(settings.get().theme).toBe("dark");
    await expect(
      settings.update(() => ({ showTerminalRuler: true })),
    ).rejects.toThrow("settings.json doesn't parse");
    expect(await readFile(file, "utf-8")).toBe('{ "theme": "light", }');
  });

  it("tells the watcher when the file changes on disk", async () => {
    settings = openSettings(() => home, 10);
    settings.get();
    const changed = new Promise((resolve) =>
      stops.push(settings.watch(resolve)),
    );

    await writeFile(file, JSON.stringify({ theme: "light" }));

    expect(await changed).toMatchObject({ theme: "light" });
  });
});
