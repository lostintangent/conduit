import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, launch, until } from "./app";

describe("settings", () => {
  let app: Conduit;
  let file: string;
  const onDisk = () => JSON.parse(fs.readFileSync(file, "utf-8"));

  beforeAll(async () => {
    app = await launch({
      name: "settings",
      settings: { terminalFontSize: 14 },
    });
    file = path.join(app.home, ".conduit", "settings.json");
  });

  afterAll(() => app?.close());

  it("applies an edit made to settings.json while it runs", async () => {
    await app.page
      .locator("html[data-theme=dark]")
      .waitFor({ state: "attached" });

    fs.writeFileSync(file, JSON.stringify({ ...onDisk(), theme: "light" }));

    await app.page
      .locator("html[data-theme=light]")
      .waitFor({ state: "attached" });
  });

  it("keeps that edit when it next saves a setting", async () => {
    await app.page.getByRole("button", { name: "Settings" }).click();
    // The box only turns on once the save comes back, so check() would race
    // it. This waits for the file instead.
    await app.page
      .getByRole("checkbox", { name: "Show terminal ruler" })
      .click();
    await app.page.keyboard.press("Escape");

    await until(() => onDisk().showTerminalRuler, "the ruler setting's save");
    expect(onDisk()).toEqual({
      terminalFontSize: 14,
      theme: "light",
      showTerminalRuler: true,
    });
  });

  it("shows a failed save instead of replacing a file that doesn't parse", async () => {
    fs.writeFileSync(file, "{ not json");

    await app.page.getByRole("button", { name: "Settings" }).click();
    const ruler = app.page.getByRole("checkbox", {
      name: "Show terminal ruler",
    });
    expect(await ruler.isChecked()).toBe(true);
    await ruler.click();

    await app.page.getByText("Couldn't update settings").waitFor();
    await app.page.getByText("settings.json doesn't parse").waitFor();
    // Turning the ruler off didn't save, so the box shows it still on.
    expect(await ruler.isChecked()).toBe(true);
    expect(fs.readFileSync(file, "utf-8")).toBe("{ not json");
  });

  it("had no uncaught errors or failed loads", () => {
    expect(app.pageErrors).toEqual([]);
    expect(app.failedRequests).toEqual([]);
  });
});
