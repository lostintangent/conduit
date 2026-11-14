/// <reference types="bun-types/jsc" />
import { drainMicrotasks } from "bun:jsc";
import { execFileSync, spawn } from "node:child_process";
import { expect, it } from "vitest";

type OnExit = (...args: unknown[]) => void;
type BunSpawn = (options: { onExit?: OnExit }) => { pid: number };

// Forces the Bun bug that the preload's holdEarlyChildExits() works around:
// the child exits, and Bun runs its exit callback and drains the tick queue,
// before Bun.spawn returns. If a Bun upgrade stops routing spawn() through
// the hold, this fails instead of the git tests going back to timing out.
it("gives listeners added after spawn() the output, exit and close of a child that exits inside it", async () => {
  const { Bun: bun } = globalThis as unknown as { Bun: { spawn: BunSpawn } };
  const bunSpawn = bun.spawn;
  let forcedEarlyExit = false;

  bun.spawn = ({ onExit, ...options }) => {
    const subprocess = bunSpawn.call(bun, options);
    if (onExit) {
      waitForExit(subprocess.pid);
      onExit(subprocess, 0, null, undefined);
      drainMicrotasks();
      forcedEarlyExit = true;
    }
    return subprocess;
  };

  let child;
  try {
    child = spawn("echo", ["early"]);
  } finally {
    bun.spawn = bunSpawn;
  }

  let stdout = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  const exited = new Promise((resolve) => child.on("exit", resolve));
  const closed = new Promise((resolve) => child.on("close", resolve));

  expect(forcedEarlyExit).toBe(true);
  expect(await exited).toBe(0);
  expect(await closed).toBe(0);
  expect(stdout).toBe("early\n");
});

// Returns once the child is a zombie (exited, not yet reaped) or gone.
function waitForExit(pid: number) {
  execFileSync("sh", [
    "-c",
    `while ps -o stat= -p ${pid} | grep -qv Z; do sleep 0.01; done`,
  ]);
}
