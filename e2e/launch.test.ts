import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isRunning, until } from "./app";

describe("a launch", () => {
  // A run that ends without closing its app, like one where a test timed out
  // or afterAll threw, and one stopped with a Ctrl-C.
  it.each([
    ["ends", false],
    ["is interrupted", true],
  ])("stops its app when the test run %s", async (_, interrupt) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "conduit-launch-"));
    const launched = path.join(dir, "launched.json");
    const testFile = path.join(dir, "left-running.test.ts");
    fs.writeFileSync(
      testFile,
      `import { test } from "bun:test";
import { execFileSync } from "node:child_process";
import { launch, processTree } from ${JSON.stringify(path.join(import.meta.dirname, "app.ts"))};

test("leaves its app running", async () => {
  const app = await launch({ name: "left-running" });
  await app.terminal();
  const tree = processTree(app.pid);
  const commands = execFileSync("ps", ["-o", "comm=", "-p", tree.join(",")], {
    encoding: "utf8",
  });
  await Bun.write(${JSON.stringify(launched)}, JSON.stringify({ home: app.home, tree, commands }));
  ${interrupt ? "await new Promise(() => {});" : ""}
}, 60_000);
`,
    );
    // A group of its own, like a run in a terminal, which a Ctrl-C signals.
    const run = spawn(process.execPath, ["test", testFile], {
      cwd: dir,
      detached: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let output = "";
    run.stderr!.on("data", (data) => (output += data));
    const ended = new Promise((resolve) => run.once("exit", resolve));
    let app: { home: string; tree: number[]; commands: string } | undefined;
    try {
      app = await until(
        () => JSON.parse(fs.readFileSync(launched, "utf8")),
        "the app to launch",
        30_000,
      );
      expect(app!.commands).toContain("/bin/zsh");

      if (interrupt) process.kill(-run.pid!, "SIGINT");
      await ended;
      await until(
        () => !app!.tree.some(isRunning),
        "the app's processes to exit",
        5_000,
      );
    } catch (error) {
      throw new Error(
        `${(error as Error).message}\nThe run's output:\n${output}`,
      );
    } finally {
      try {
        process.kill(-run.pid!, "SIGKILL");
      } catch {}
      for (const pid of app?.tree ?? []) {
        if (isRunning(pid)) process.kill(pid, "SIGKILL");
      }
      if (app) fs.rmSync(app.home, { recursive: true, force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
