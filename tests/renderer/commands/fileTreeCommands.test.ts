import { getContextKeyService } from "@/commands";
import {
  fileTreeCwd,
  fileTreeTargetPath,
} from "@/commands/contextKeys/appContextKeys";
import type { CommandRegistry } from "@/commands/core/CommandRegistryImpl";
import type { CommandDescriptor } from "@/commands/core/types";
import {
  FileTreeCommands,
  registerFileTreeCommands,
} from "@/commands/fileTreeCommands";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commandContext } from "./fixtures";

describe("Copy Relative Path", () => {
  const writeClipboard = vi.fn<(text: string) => void>();
  let copyRelativePath: CommandDescriptor;

  beforeEach(() => {
    writeClipboard.mockClear();
    Object.assign(window, { conduit: { writeClipboard } });

    const commands = new Map<string, CommandDescriptor>();
    registerFileTreeCommands({
      registerCommand: (descriptor: CommandDescriptor) => {
        commands.set(descriptor.id, descriptor);
        return { dispose: () => {} };
      },
    } as unknown as CommandRegistry);
    copyRelativePath = commands.get(FileTreeCommands.COPY_RELATIVE_PATH)!;
  });

  function copy(path: string, cwd: string) {
    getContextKeyService().setGlobal(fileTreeTargetPath.key, path);
    getContextKeyService().setGlobal(fileTreeCwd.key, cwd);
    copyRelativePath.run(commandContext());
    return writeClipboard.mock.calls[0]?.[0];
  }

  it("copies a path under the root relative to it", () => {
    expect(copy("/a/proj/src/x.ts", "/a/proj")).toBe("src/x.ts");
  });

  it("keeps a sibling that shares the root's prefix absolute", () => {
    expect(copy("/a/proj-2/x.ts", "/a/proj")).toBe("/a/proj-2/x.ts");
  });
});
