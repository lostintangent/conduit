import { getDefaultActions } from "@/commands/paneActions/core/defaults";
import {
  hasUserPaneActionsFile,
  resetPaneActionsToDefaults,
  savePaneActions,
} from "@/commands/paneActions/io/userPaneActions";
import { paneActionsAtom } from "@/store/atoms";
import { access, mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("userPaneActions", () => {
  let homeDirectory: string;

  beforeEach(async () => {
    homeDirectory = await mkdtemp(join(tmpdir(), "pane-actions-home-"));
    (globalThis as any).window.conduit = {
      files: {
        writeFile: async (_cwd: string, path: string, content: Uint8Array) => {
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, content);
        },
        exists: async (path: string) =>
          access(path).then(
            () => true,
            () => false,
          ),
        delete: (_cwd: string, path: string) => rm(path),
      },
    };
  });

  afterEach(async () => {
    await rm(homeDirectory, { recursive: true, force: true });
  });

  it("resets a saved configuration back to the defaults", async () => {
    const defaults = getDefaultActions();
    await savePaneActions(defaults.slice(0, 1), homeDirectory);
    expect(await hasUserPaneActionsFile(homeDirectory)).toBe(true);

    await resetPaneActionsToDefaults(homeDirectory);

    expect(await hasUserPaneActionsFile(homeDirectory)).toBe(false);
    expect(paneActionsAtom.get()).toEqual(defaults);
  });
});
