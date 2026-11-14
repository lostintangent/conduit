import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

const sendCliCommand = vi.hoisted(() =>
  vi.fn<(name: string, args?: object) => Promise<unknown>>(),
);

vi.mock("../../src/cli/ipc/ipc", () => ({ sendCliCommand }));

import registerBrowserCommands from "../../src/cli/commands/browser";
import registerPaneCommands from "../../src/cli/commands/pane";
import "../../src/cli/ipc";

async function run(args: string[]) {
  const program = new Command()
    .exitOverride()
    .configureOutput({ writeErr: () => {} });
  registerPaneCommands(program);
  registerBrowserCommands(program);

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

describe("browser automation commands", () => {
  it.each([
    [
      "browser-query button -p pane-1 -c h0 -t Save -r button -m 3 --timeout 250 --dump-tree",
      {
        paneId: "pane-1",
        selector: "button",
        contextHandle: "h0",
        text: "Save",
        role: "button",
        maxResults: 3,
        timeout: 250,
        dumpTree: true,
      },
    ],
    [
      "browser-click h1 -p pane-1 -b right -c 2 --offset-x 4 --offset-y 5",
      {
        paneId: "pane-1",
        handle: "h1",
        button: "right",
        clicks: 2,
        offset: { x: 4, y: 5 },
      },
    ],
    [
      "browser-hover h1 -p pane-1 --offset-x 4",
      { paneId: "pane-1", handle: "h1", offset: { x: 4 } },
    ],
    [
      "browser-focus h1 -p pane-1 --no-scroll",
      { paneId: "pane-1", handle: "h1", scroll: false },
    ],
    [
      "browser-type h1 hello -p pane-1 -s -d 10 -r",
      {
        paneId: "pane-1",
        handle: "h1",
        text: "hello",
        submit: true,
        delay: 10,
        replace: true,
      },
    ],
    [
      "browser-keys Enter Meta+R -p pane-1",
      { paneId: "pane-1", keys: ["Enter", "Meta+R"] },
    ],
    [
      "browser-scroll h1 -p pane-1 -x 10 -y 300 -d down -s",
      {
        paneId: "pane-1",
        handle: "h1",
        x: 10,
        y: 300,
        direction: "down",
        smooth: true,
      },
    ],
    [
      "browser-wait #ready -p pane-1 -s networkidle --timeout 100",
      {
        paneId: "pane-1",
        selector: "#ready",
        state: "networkidle",
        timeout: 100,
      },
    ],
  ])("passes the options of `%s`", async (command, expected) => {
    const args = command.split(" ");

    expect(await run(args)).toEqual([args[0], expected]);
  });
});

describe("integer options", () => {
  it.each([
    "browser-click h1 --clicks abc",
    "browser-query button --timeout 5s",
    "browser-scroll -y 1.5",
  ])("rejects `%s` without sending it", async (command) => {
    await expect(run(command.split(" "))).rejects.toThrow(
      "is invalid. Expected an integer.",
    );
    expect(sendCliCommand).not.toHaveBeenCalled();
  });

  it("accepts negative integers", async () => {
    expect(await run(["browser-scroll", "-y", "-200"])).toEqual([
      "browser-scroll",
      { y: -200 },
    ]);
  });
});
