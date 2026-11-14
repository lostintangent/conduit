import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, git, launch, until } from "./app";

describe("agent launcher", () => {
  let app: Conduit;

  beforeAll(async () => {
    app = await launch({
      name: "agents",
      files: {
        // Most configs take a moment to load, which is when a command typed
        // ahead of the first prompt shows up twice.
        ".zshrc": "sleep 0.3\nPROMPT='%% '\n",
        ".conduit/settings.json": JSON.stringify({
          agents: [
            {
              id: "e2e",
              name: "E2E Agent",
              command: "echo {arg}",
              interactiveCommand: "echo agent-{arg}-$((6*7))",
              isDefault: true,
            },
          ],
        }),
        "proj/README.md": "# E2E\n",
      },
    });
    const project = path.join(app.home, "proj");
    git(project, "init", "-q");
    git(project, "add", "-A");
    git(project, "commit", "-qm", "Initial commit");
  });

  afterAll(() => app?.close());

  it("launches agents with each one's command typed once", async () => {
    const terminal = await app.terminal();
    expect(await terminal.run("cd proj")).toBe(0);

    await app.page.keyboard.press("Meta+I");
    await app.page
      .getByPlaceholder("Describe what you want the agents to do...")
      .fill("hi");
    await app.page.getByTitle("Increase instances").click();
    await app.page.getByRole("button", { name: "Launch", exact: true }).click();

    await app.page
      .getByRole("tab", { name: /worktrees\/proj\//, selected: true })
      .waitFor();
    const panes = app.page.locator(".xterm").filter({ visible: true });
    await until(async () => (await panes.count()) === 2, "2 agent panes");

    for (const index of [0, 1]) {
      const agent = await app.terminal(index);
      const text = await agent.waitForText(/^agent-hi-42$/m);
      expect(text.match(/echo agent-/g)).toHaveLength(1);
    }
  });

  it("had no uncaught errors or failed loads", () => {
    expect(app.pageErrors).toEqual([]);
    expect(app.failedRequests).toEqual([]);
  });
});
