import * as os from "node:os";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createGit } from "../../../src/ipc/git/createGit";
import { warmUpSpawn } from "../../setup/spawn";

const shellEnv = {
  GIT_AUTHOR_NAME: "Shell Author",
  GIT_AUTHOR_EMAIL: "shell@example.com",
  GIT_EDITOR: "shell-editor",
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "conduit.probe",
  GIT_CONFIG_VALUE_0: "from-shell",
};

describe("createGit", () => {
  const originalEnv = { ...process.env };

  beforeAll(warmUpSpawn);

  afterEach(() => {
    for (const key of Object.keys(shellEnv)) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it("runs git with the shell's git variables", async () => {
    Object.assign(process.env, shellEnv);
    const git = createGit(os.tmpdir());

    const author = await git.raw(["var", "GIT_AUTHOR_IDENT"]);
    const editor = await git.raw(["var", "GIT_EDITOR"]);
    const config = await git.raw(["config", "--get", "conduit.probe"]);

    expect(author).toContain("Shell Author <shell@example.com>");
    expect(editor.trim()).toBe("shell-editor");
    expect(config.trim()).toBe("from-shell");
  });
});
