import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";

const { send, providers, FakeProvider } = vi.hoisted(() => {
  type Listener = (event: unknown) => void;
  const providers: InstanceType<typeof FakeProvider>[] = [];

  // Stands in for DiskFileSystemProvider, so the real provider service and
  // its pool decide when a provider, and with it the watcher, is disposed.
  class FakeProvider {
    readonly listeners = {
      directory: new Set<Listener>(),
      content: new Set<Listener>(),
      deleted: new Set<Listener>(),
      renamed: new Set<Listener>(),
    };
    startWatching = vi.fn(async () => {});
    dispose = vi.fn(async () => {});
    readDirectory = vi.fn(async (_dirPath: string) => []);
    writeFile = vi.fn(async (_filePath: string, _content: Uint8Array) => {});
    onDirectoryListingChanged = this.on(this.listeners.directory);
    onFileContentChanged = this.on(this.listeners.content);
    onFileDeleted = this.on(this.listeners.deleted);
    onFileRenamed = this.on(this.listeners.renamed);

    constructor(readonly cwd: string) {
      providers.push(this);
    }

    fire(kind: keyof FakeProvider["listeners"], event: unknown) {
      for (const listener of this.listeners[kind]) listener(event);
    }

    private on(set: Set<Listener>) {
      return (listener: Listener) => {
        set.add(listener);
        return { dispose: () => set.delete(listener) };
      };
    }
  }

  return { send: vi.fn(), providers, FakeProvider };
});

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [{ webContents: { send } }] },
}));
vi.mock("./DiskFileSystemProvider", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  DiskFileSystemProvider: FakeProvider,
}));
vi.mock("@features/git/main/GitProviderService", () => ({
  GitProviderService: {
    getInstance: () => ({
      getProvider: async () => {
        throw new Error("Not a git repository");
      },
      releaseProvider: () => {},
      notifyFileChanged: async () => {},
    }),
  },
}));

import { FileSystemProviderService } from "./FileSystemProviderService";
import service, { releaseFileSubscriptions } from "./service";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "files-")));
const file = path.join(dir, "package.json");
const other = path.join(dir, "other.ts");
fs.writeFileSync(file, '{"scripts":{}}');

/** Past the pool's grace period, when a provider nothing holds is disposed. */
const afterGrace = () => vi.advanceTimersByTimeAsync(5000);

function fireEverything(provider: InstanceType<typeof FakeProvider>) {
  provider.fire("directory", { path: dir, entries: [] });
  for (const changed of [other, file]) {
    provider.fire("content", { path: changed });
    provider.fire("deleted", { path: changed, isDirectory: false });
    provider.fire("renamed", {
      oldPath: changed,
      newPath: `${changed}.bak`,
      isDirectory: false,
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  releaseFileSubscriptions();
  FileSystemProviderService.resetInstance();
  providers.length = 0;
  vi.clearAllMocks();
  vi.useRealTimers();
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

// The package.json search reads from every parent of a terminal's cwd, up to /
it("reads from disk without watching anything", async () => {
  expect(new TextDecoder().decode(await service.readFile(file))).toBe(
    '{"scripts":{}}',
  );
  expect(await service.readTextFile(file)).toBe('{"scripts":{}}');
  expect(await service.stat(dir)).toMatchObject({ type: "directory" });
  expect(await service.exists(file)).toBe(true);
  await expect(
    service.readFile(path.join(dir, "missing")),
  ).rejects.toMatchObject({ code: "ENOENT" });

  expect(providers).toHaveLength(0);
});

it("sends its provider's events with the subscription's id until unsubscribed", async () => {
  const id = await service.subscribe(dir);
  const [provider] = providers;

  provider.fire("directory", { path: dir, entries: [] });
  provider.fire("content", { path: file });
  provider.fire("deleted", { path: file, isDirectory: false });
  provider.fire("renamed", {
    oldPath: file,
    newPath: other,
    isDirectory: false,
  });

  expect(send.mock.calls).toEqual([
    [
      "files:directoryListingChanged",
      { subscriptionId: id, path: dir, entries: [] },
    ],
    ["files:fileContentChanged", { subscriptionId: id, path: file }],
    [
      "files:fileDeleted",
      { subscriptionId: id, path: file, isDirectory: false },
    ],
    [
      "files:fileRenamed",
      { subscriptionId: id, oldPath: file, newPath: other, isDirectory: false },
    ],
  ]);

  service.unsubscribe(id);
  service.unsubscribe(id);
  fireEverything(provider);
  await afterGrace();

  expect(send).toHaveBeenCalledTimes(4);
  expect(provider.dispose).toHaveBeenCalledTimes(1);
});

it("sends a file's subscription only that file's changes", async () => {
  const id = await service.subscribe(dir, file);

  fireEverything(providers[0]);

  expect(send.mock.calls).toEqual([
    ["files:fileContentChanged", { subscriptionId: id, path: file }],
    [
      "files:fileDeleted",
      { subscriptionId: id, path: file, isDirectory: false },
    ],
    [
      "files:fileRenamed",
      {
        subscriptionId: id,
        oldPath: file,
        newPath: `${file}.bak`,
        isDirectory: false,
      },
    ],
  ]);
});

it("releases every subscription when the page that made them goes away", async () => {
  await service.subscribe(dir);
  await service.subscribe(dir, file);
  expect(providers).toHaveLength(1);

  releaseFileSubscriptions();
  fireEverything(providers[0]);
  await afterGrace();

  expect(send).not.toHaveBeenCalled();
  expect(providers[0].dispose).toHaveBeenCalledTimes(1);
});

it("lists and writes through a subscription's provider, or borrows one", async () => {
  const content = new TextEncoder().encode("x");

  await service.readDirectory(dir, dir);
  await service.writeFile(dir, other, content);
  await afterGrace();
  expect(providers).toHaveLength(1);
  expect(providers[0].readDirectory).toHaveBeenCalledWith(dir);
  expect(providers[0].writeFile).toHaveBeenCalledWith(other, content);
  expect(providers[0].dispose).toHaveBeenCalledTimes(1);

  await service.subscribe(dir);
  await service.readDirectory(dir, dir);
  await service.writeFile(dir, other, content);
  await afterGrace();
  expect(providers).toHaveLength(2);
  expect(providers[1].readDirectory).toHaveBeenCalledWith(dir);
  expect(providers[1].writeFile).toHaveBeenCalledWith(other, content);
  expect(providers[1].dispose).not.toHaveBeenCalled();
});
