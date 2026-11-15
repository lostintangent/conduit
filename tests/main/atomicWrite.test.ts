import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileAtomically, writeJsonFile } from "../../src/main/atomicWrite";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "atomic-write-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("writeFileAtomically", () => {
  it("lands writes to one file in the order they were asked for", async () => {
    const file = path.join(dir, "state.json");
    // Earlier writes are bigger, so they'd finish last if they raced
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        writeFileAtomically(file, `${"x".repeat((10 - i) * 400_000)}${i}`),
      ),
    );

    expect(readFileSync(file, "utf-8")).toBe(`${"x".repeat(400_000)}9`);
    expect(readdirSync(dir)).toEqual(["state.json"]);
  });

  it("replaces the file a symlink points to, and keeps the symlink", async () => {
    mkdirSync(path.join(dir, "dotfiles"));
    const target = path.join(dir, "dotfiles", "settings.json");
    const link = path.join(dir, "settings.json");
    writeFileSync(target, "old");
    symlinkSync(target, link);

    await writeFileAtomically(link, "new");

    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readFileSync(target, "utf-8")).toBe("new");
    expect(readdirSync(path.join(dir, "dotfiles"))).toEqual(["settings.json"]);
  });

  it("keeps the file's permissions", async () => {
    const file = path.join(dir, "private.json");
    writeFileSync(file, "old");
    chmodSync(file, 0o600);

    await writeFileAtomically(file, "new");

    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("rejects, and leaves the old file alone, when it can't write", async () => {
    const file = path.join(dir, "state.json");
    writeFileSync(file, "old");
    chmodSync(dir, 0o500);

    try {
      await expect(writeFileAtomically(file, "new")).rejects.toThrow("EACCES");
      // A failed write doesn't hold up the next one
      chmodSync(dir, 0o700);
      await writeFileAtomically(file, "newer");
    } finally {
      chmodSync(dir, 0o700);
    }

    expect(readFileSync(file, "utf-8")).toBe("newer");
    expect(readdirSync(dir)).toEqual(["state.json"]);
  });
});
