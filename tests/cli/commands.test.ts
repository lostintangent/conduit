import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

const sendCliCommand = vi.hoisted(() =>
  vi.fn<(name: string, args?: object) => Promise<unknown>>(),
);

vi.mock("../../src/cli/ipc/ipc", () => ({ sendCliCommand }));

import registerPaneCommands from "../../src/cli/commands/pane";
import "../../src/cli/ipc";

async function run(args: string[]) {
  const program = new Command().exitOverride();
  registerPaneCommands(program);

  sendCliCommand.mockClear();
  await program.parseAsync(args, { from: "user" });
  return sendCliCommand.mock.calls[0];
}

describe("pane-close", () => {
  it.each([
    [["close", "--tab"], { closeTab: true }],
    [["close", "-t"], { closeTab: true }],
    [["close", "-p", "pane-2"], { closeTab: false, paneId: "pane-2" }],
  ])("sends %j as %j", async (args, expected) => {
    expect(await run(args)).toEqual(["pane-close", expected]);
  });
});
