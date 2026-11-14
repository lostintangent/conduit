import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, launch, type Terminal } from "./app";

describe("terminal and CLI", () => {
  let app: Conduit;
  let terminal: Terminal;

  beforeAll(async () => {
    app = await launch({ name: "terminal" });
    terminal = await app.terminal();
  });

  afterAll(() => app?.close());

  it("runs its shell in the isolated home", async () => {
    expect(await terminal.run('echo "home is $HOME"')).toBe(0);
    expect(await terminal.text()).toContain(`home is ${app.home}\n`);
  });

  it("puts a conduit CLI on the PATH that controls this window", async () => {
    expect(await terminal.run("conduit --help | head -3")).toBe(0);
    expect(await terminal.text()).toContain(
      "Interact with Conduit, from within Conduit!",
    );

    await terminal.type("conduit tab-new --title E2E-CLI-TAB\n");
    await app.page
      .getByRole("tab", { name: /E2E-CLI-TAB/, selected: true })
      .waitFor();
  });

  it("had no uncaught errors or failed loads", () => {
    expect(app.pageErrors).toEqual([]);
    expect(app.failedRequests).toEqual([]);
  });
});
