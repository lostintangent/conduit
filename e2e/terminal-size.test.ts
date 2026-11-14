import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, launch } from "./app";
import { expectStartedAtPaneWidth, zshenv } from "./shells";

describe.each([
  ["the default font size", undefined],
  ["a 24pt font", 24],
  ["a 32pt font", 32],
])("new shells with %s", (_, terminalFontSize) => {
  let app: Conduit;

  beforeAll(async () => {
    app = await launch({
      name: `terminal-size-${terminalFontSize ?? "default"}`,
      files: { ".zshenv": zshenv },
      settings: terminalFontSize ? { terminalFontSize } : undefined,
    });
  });

  afterAll(() => app?.close());

  const selectedTab = (index: number) =>
    app.page
      .getByRole("tab")
      .nth(index)
      .and(app.page.getByRole("tab", { selected: true }));
  const visibleTerminals = () =>
    app.page.locator(".xterm").filter({ visible: true });

  it("starts the window's first shell at its pane's width", async () => {
    await expectStartedAtPaneWidth(app, await app.terminal());
  });

  it("starts a new tab's shell at its pane's width", async () => {
    await app.page.keyboard.press("Meta+t");
    await selectedTab(1).waitFor();
    await expectStartedAtPaneWidth(app, await app.terminal());
  });

  it("starts a split's shell at its pane's width", async () => {
    await app.page.keyboard.press("Meta+Shift+ArrowRight");
    await visibleTerminals().nth(1).waitFor();
    await expectStartedAtPaneWidth(app, await app.terminal(1));
  });

  it("starts a duplicated tab's shells at their panes' widths", async () => {
    await app.page.keyboard.press("Meta+Shift+d");
    await selectedTab(2).waitFor();
    await visibleTerminals().nth(1).waitFor();
    await expectStartedAtPaneWidth(app, await app.terminal(0));
    await expectStartedAtPaneWidth(app, await app.terminal(1));
  });

  it("had no uncaught errors or failed loads", () => {
    expect(app.pageErrors).toEqual([]);
    expect(app.failedRequests).toEqual([]);
  });
});
