/**
 * Files for the renderer.
 *
 * Reads (file, text, stat, exists) go straight to disk and never create a
 * provider, since a provider starts a recursive watcher on its cwd. Callers
 * like the package.json search read from parents such as /Users or /.
 *
 * Directory listings and writes go through `cwd`'s provider, because they
 * keep its directory cache current. They use the provider a subscription
 * holds, or borrow one for just the call.
 *
 * A subscription holds its provider, and with it the watcher, until it's
 * released.
 */

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DeleteOptions } from "../model";
import {
  type DiskFileSystemProvider,
  diskReads,
} from "./DiskFileSystemProvider";
import { emit } from "./events";
import { getPreWarmedCache, warmFileCache } from "./fileCacheWarmer";
import { FileSystemProviderService } from "./FileSystemProviderService";
import { pathEquals } from "./pathUtils";

const providers = () => FileSystemProviderService.getInstance();

/** Run `call` with `cwd`'s provider, borrowing one if nothing holds it. */
async function withProvider<T>(
  cwd: string,
  call: (provider: DiskFileSystemProvider) => Promise<T>,
): Promise<T> {
  const existing = providers().getExistingProvider(cwd);
  if (existing) {
    return call(existing);
  }
  const provider = await providers().getProvider(cwd);
  try {
    return await call(provider);
  } finally {
    providers().releaseProvider(cwd);
  }
}

/** Each live subscription's release, by id. */
const subscriptions = new Map<string, () => void>();
let lastSubscriptionId = 0;

const service = {
  ...diskReads,

  /** Sorted directories first, then files. */
  readDirectory(cwd: string, dirPath: string) {
    return withProvider(cwd, (provider) => provider.readDirectory(dirPath));
  },

  /** Creates the file and its parent directories if they don't exist. */
  writeFile(cwd: string, filePath: string, content: Uint8Array) {
    return withProvider(cwd, (provider) =>
      provider.writeFile(filePath, content),
    );
  },

  delete(cwd: string, path: string, options?: DeleteOptions) {
    return withProvider(cwd, (provider) => provider.delete(path, options));
  },

  rename(cwd: string, oldPath: string, newPath: string) {
    return withProvider(cwd, (provider) => provider.rename(oldPath, newPath));
  },

  /** Creates parent directories too, like `mkdir -p`. */
  createDirectory(cwd: string, dirPath: string) {
    return withProvider(cwd, (provider) => provider.createDirectory(dirPath));
  },

  /**
   * Watch `cwd` until `unsubscribe`. Its events carry the id this returns.
   * With `filePath`, only that file's content, delete and rename events.
   */
  async subscribe(cwd: string, filePath?: string) {
    const provider = await providers().getProvider(cwd);
    const subscriptionId = `fs-sub-${++lastSubscriptionId}`;
    const watches = (eventPath: string) =>
      !filePath || pathEquals(eventPath, filePath);

    const listeners = [
      provider.onFileContentChanged((event) => {
        if (watches(event.path)) {
          emit("fileContentChanged", { subscriptionId, ...event });
        }
      }),
      provider.onFileDeleted((event) => {
        if (watches(event.path)) {
          emit("fileDeleted", { subscriptionId, ...event });
        }
      }),
      provider.onFileRenamed((event) => {
        if (watches(event.oldPath)) {
          emit("fileRenamed", { subscriptionId, ...event });
        }
      }),
    ];
    if (!filePath) {
      listeners.push(
        provider.onDirectoryListingChanged((event) =>
          emit("directoryListingChanged", { subscriptionId, ...event }),
        ),
      );
    }

    subscriptions.set(subscriptionId, () => {
      for (const listener of listeners) {
        listener.dispose();
      }
      providers().releaseProvider(cwd);
    });
    return subscriptionId;
  },

  unsubscribe(subscriptionId: string) {
    subscriptions.get(subscriptionId)?.();
    subscriptions.delete(subscriptionId);
  },

  /** Writes `content` to a new temporary file, for canvas capture. */
  async writeTempFile(content: Uint8Array, extension?: string) {
    const suffix = extension ? `.${extension}` : "";
    const filePath = path.join(tmpdir(), `conduit-${randomUUID()}${suffix}`);
    await fs.writeFile(filePath, content);
    return filePath;
  },

  /**
   * Every file under `root` for quick open, from a cache that its watcher
   * keeps current. Scans first when there's no cache yet.
   */
  async quickOpenFiles(root: string) {
    if (!getPreWarmedCache(root)?.files.length) {
      await warmFileCache(root);
    }
    return getPreWarmedCache(root)?.files ?? [];
  },
};

export default service;

declare module "@shared/rpc" {
  interface Services {
    files: typeof service;
  }
}

/**
 * Release every subscription, when the page that made them reloads or closes.
 * Providers outlive their last reference by a grace period, so a reloaded
 * page that subscribes again reuses the same watchers.
 */
export function releaseFileSubscriptions(): void {
  for (const release of subscriptions.values()) {
    release();
  }
  subscriptions.clear();
}
