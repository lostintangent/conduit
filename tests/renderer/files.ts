import { vi } from "vitest";

const resolves = <T>(make: () => T) => vi.fn(async (..._args: any[]) => make());

/**
 * Mock the IPC calls that read and write files, each resolving as if every
 * file were empty and every directory had no entries, and return them. Call
 * it before each test, since it replaces the last mocks.
 */
export function mockFiles() {
  const files = {
    readFile: resolves<any>(() => new Uint8Array(0)),
    readTextFile: resolves<any>(() => ""),
    stat: resolves<any>(() => ({ type: "file", size: 0, mtime: 0, ctime: 0 })),
    exists: resolves<any>(() => true),
    readDirectory: resolves<any>(() => []),
    writeFile: resolves<any>(() => undefined),
    delete: resolves<any>(() => undefined),
    rename: resolves<any>(() => undefined),
    createDirectory: resolves<any>(() => undefined),
  };
  const conduit = ((window as any).conduit ??= {});
  conduit.files = Object.assign(conduit.files ?? {}, files);
  return files;
}
