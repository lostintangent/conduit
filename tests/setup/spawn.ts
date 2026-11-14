import { spawn } from "node:child_process";

/**
 * Works around a Bun bug. Under load, a spawn early in a young `bun test`
 * worker can be slow enough that a fast child like `git var` exits before
 * spawn() returns. Bun's node:child_process then emits exit and close, and
 * drains stdout, before simple-git can listen, so the call never settles.
 * This pays that slow spawn on `cat`, which can't exit until its stdin closes
 * after spawn() has returned.
 *
 * Call it from `beforeAll` in each file that runs real git through
 * simple-git: the same warm-up in the test preload doesn't help. To check
 * whether a Bun upgrade fixed the bug, drop it from createGit.test.ts and run
 * that file alone 1,000 times, 12 at a time. It used to hang about once per
 * 100 runs.
 */
export async function warmUpSpawn() {
  const cat = spawn("cat");
  const closed = new Promise((resolve) => cat.on("close", resolve));
  cat.stdin.end();
  await closed;
}
