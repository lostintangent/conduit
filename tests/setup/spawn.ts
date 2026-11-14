import { ChildProcess } from "node:child_process";

type OnExit = (...args: unknown[]) => void;

/**
 * Works around a Bun bug on macOS (oven-sh/bun#45483). Under load, Bun.spawn
 * can be slow enough that a fast child like `git var` exits before it returns.
 * Bun then runs its exit callback and drains the tick queue inside spawn(),
 * so node:child_process emits exit and close, and drops stdout, before
 * simple-git can listen, and the call never settles. Node never runs a tick
 * inside spawn().
 *
 * This holds an exit that arrives while spawn() is running until it returns,
 * like Node. spawn.test.ts forces the bug, so it fails if a Bun upgrade stops
 * passing spawn() through here.
 *
 * To check whether a Bun upgrade fixed the bug, drop the call from the preload
 * and spawn.test.ts, and run `bun run test` 100 times. createGit.test.ts or
 * getCommitFiles.test.ts timed out in about 1 of 40 runs on 1.4.5 canary.
 */
export function holdEarlyChildExits() {
  const childProcess = ChildProcess.prototype as unknown as {
    spawn: (this: ChildProcess, options: unknown) => unknown;
  };
  const { Bun: bun } = globalThis as unknown as {
    Bun: { spawn: (options: { onExit?: OnExit }) => unknown };
  };
  const spawnChild = childProcess.spawn;

  childProcess.spawn = function (options) {
    const bunSpawn = bun.spawn;
    let spawning = true;
    let heldExit: (() => void) | undefined;

    bun.spawn = (spawnOptions) => {
      const { onExit } = spawnOptions;
      return bunSpawn.call(bun, {
        ...spawnOptions,
        onExit:
          onExit &&
          ((...args: unknown[]) => {
            if (spawning) heldExit = () => onExit(...args);
            else onExit(...args);
          }),
      });
    };

    try {
      return spawnChild.call(this, options);
    } finally {
      bun.spawn = bunSpawn;
      spawning = false;
      heldExit?.();
    }
  };
}
