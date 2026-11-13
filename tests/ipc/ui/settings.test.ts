import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSettings, saveSettings } from "../../../src/ipc/ui/settings";

vi.mock("electron", () => ({
  app: { getPath: () => "/Users/test" },
}));

describe("settings", () => {
  let stateDirectory: string;

  beforeEach(async () => {
    stateDirectory = await mkdtemp(path.join(tmpdir(), "conduit-settings-"));
  });

  afterEach(async () => {
    await rm(stateDirectory, { recursive: true, force: true });
  });

  it("defaults the terminal ruler to off", async () => {
    const settings = await loadSettings(stateDirectory);

    expect(settings.showTerminalRuler).toBe(false);
  });

  it("keeps the terminal ruler on once the user turns it on", async () => {
    const settings = await loadSettings(stateDirectory);
    await saveSettings({ ...settings, showTerminalRuler: true });

    const reloaded = await loadSettings(stateDirectory);

    expect(reloaded.showTerminalRuler).toBe(true);
  });
});
