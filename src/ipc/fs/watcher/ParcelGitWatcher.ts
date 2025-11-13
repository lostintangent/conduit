import watcher, { AsyncSubscription } from "@parcel/watcher";
import path from "node:path";
import type { IGitWatcher } from "./IGitWatcher";
import type { GitStatusMap } from "@shared/types";
import { getGitStatus, getGitStatusForFile } from "../../git/gitStatus";

export class ParcelGitWatcher implements IGitWatcher {
  private subscription: AsyncSubscription | null = null;
  private watching = false;
  private changeCallbacks: Array<() => void> = [];

  constructor(
    private readonly cwd: string,
    private readonly gitRoot: string,
  ) {}

  async watch(): Promise<void> {
    if (this.watching) {
      return;
    }

    console.log(`[ParcelGit] Starting watch on ${this.gitRoot}/.git`);

    const backend =
      process.platform === "darwin"
        ? "fs-events"
        : process.platform === "linux"
          ? "inotify"
          : "windows";

    try {
      // Watch .git directory for relevant changes
      this.subscription = await watcher.subscribe(
        path.join(this.gitRoot, ".git"),
        (err, events) => {
          if (err) {
            console.error(`[ParcelGit] Error:`, err);
            return;
          }

          // Filter for relevant git files
          const relevantChanges = events.filter((e) => {
            const basename = path.basename(e.path);
            const dirname = path.dirname(e.path);

            return (
              basename === "index" ||
              basename === "HEAD" ||
              dirname.includes("refs")
            );
          });

          if (relevantChanges.length > 0) {
            console.log(
              `[ParcelGit] Git change detected (${relevantChanges.length} relevant files)`,
            );
            this.notifyCallbacks();
          }
        },
        {
          backend,
          ignore: [
            "**/logs/**",
            "**/hooks/**",
            "**/objects/**", // Too many changes, not relevant for our purposes
          ],
        },
      );

      this.watching = true;
      console.log(`[ParcelGit] Now watching ${this.gitRoot}/.git`);
    } catch (error) {
      console.error(`[ParcelGit] Failed to start watching:`, error);
      throw error;
    }
  }

  async unwatch(): Promise<void> {
    if (!this.watching || !this.subscription) {
      return;
    }

    console.log(`[ParcelGit] Stopping watch`);
    await this.subscription.unsubscribe();
    this.subscription = null;
    this.watching = false;
  }

  onGitChanged(callback: () => void): void {
    this.changeCallbacks.push(callback);
  }

  getGitRoot(): string | null {
    return this.gitRoot;
  }

  async computeGitStatusFull(
    baseBranch: string | null,
  ): Promise<GitStatusMap | null> {
    try {
      return await getGitStatus(this.cwd, baseBranch);
    } catch (error) {
      console.error(`[ParcelGit] Failed to compute git status:`, error);
      return null;
    }
  }

  async computeGitStatusForFile(
    filePath: string,
  ): Promise<{ status: string } | null> {
    try {
      return await getGitStatusForFile(this.gitRoot, filePath);
    } catch (error) {
      console.error(
        `[ParcelGit] Failed to compute git status for file:`,
        error,
      );
      return null;
    }
  }

  private notifyCallbacks(): void {
    for (const callback of this.changeCallbacks) {
      callback();
    }
  }
}
