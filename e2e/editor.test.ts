import fs from "node:fs";
import path from "node:path";
import type { Locator } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, git, launch, type Terminal, until } from "./app";

/** The editor's rendered lines, joined with newlines. */
async function textOf(editor: Locator): Promise<string> {
  const lines = await editor.locator(".view-line").allTextContents();
  return lines.map((line) => line.replaceAll("\u00a0", " ")).join("\n");
}

async function waitForTextIn(editor: Locator, text: string): Promise<string> {
  return until(async () => {
    const current = await textOf(editor);
    return current.includes(text) && current;
  }, `"${text}" in the editor`);
}

describe("editor", () => {
  let app: Conduit;
  let terminal: Terminal;
  let project: string;

  const read = (file: string) =>
    fs.readFileSync(path.join(project, file), "utf8");
  const write = (file: string, content: string) =>
    fs.writeFileSync(path.join(project, file), content);

  beforeAll(async () => {
    app = await launch({
      name: "editor",
      files: {
        "proj/src/a.ts": "export const a = 1;\nexport const b = 2;\n",
        "proj/b.txt": "bravo\n",
        "proj/notes.md": "# E2E heading\n\nSome **bold** text.\n",
      },
    });
    project = path.join(app.home, "proj");
    git(project, "init", "-q");
    git(project, "add", "-A");
    git(project, "commit", "-qm", "Initial commit");
    write("b.txt", "edited bravo\n");

    terminal = await app.terminal();
  });

  afterAll(() => app?.close());

  const tree = () => app.page.getByRole("tree", { name: "File tree" });
  const treeItem = (name: string) =>
    tree().getByRole("treeitem", {
      name: new RegExp(`^${name.replace(".", "\\.")}`),
    });
  const editor = () =>
    app.page
      .locator(".monaco-editor:not(.monaco-diff-editor *)")
      .filter({ visible: true });
  const diffEditor = () =>
    app.page.locator(".monaco-diff-editor").filter({ visible: true });
  const mode = (name: string) => app.page.getByRole("radio", { name });

  it("shows a repo's changes, and keeps them current as files change on disk", async () => {
    // /tmp is a symlink on macOS, so this opens the project through one.
    expect(await terminal.run(`cd /tmp/${path.basename(app.home)}/proj`)).toBe(
      0,
    );
    await terminal.type("conduit open .\n");
    await treeItem("b.txt").getByTitle("Modified").waitFor();

    write("new.txt", "new\n");
    write("notes.md", "# E2E heading\n\nSome **bold** text, edited.\n");
    await treeItem("new.txt").getByTitle("Untracked").waitFor();
    await treeItem("notes.md").getByTitle("Modified").waitFor();
  });

  it("opens a changed file as a diff against HEAD", async () => {
    await treeItem("b.txt").click();
    await waitForTextIn(
      diffEditor().locator(".editor.modified"),
      "edited bravo",
    );
    expect(await textOf(diffEditor().locator(".editor.original"))).toContain(
      "bravo",
    );
  });

  it("opens a file from the CLI with its language's support", async () => {
    expect(await terminal.run(`cd ${project}`)).toBe(0);
    await terminal.type("conduit open src/a.ts\n");
    await waitForTextIn(editor(), "export const b = 2;");
    await app.page
      .locator('[data-mode-id="typescript"]')
      .first()
      .waitFor({ state: "attached" });
    await until(
      () =>
        app.page
          .workers()
          .some((worker) => worker.url().endsWith("/ts.worker.js")),
      "the TypeScript worker",
    );
  });

  it("saves an edit to disk with Cmd+S", async () => {
    await editor().locator(".view-lines").click();
    await app.page.keyboard.press("Meta+ArrowDown");
    await app.page.keyboard.type("export const c = 3;");
    await app.page.keyboard.press("Meta+s");
    await until(
      () => read("src/a.ts").includes("export const c = 3;"),
      "the save",
    );
    expect(read("src/a.ts")).toBe(
      "export const a = 1;\nexport const b = 2;\nexport const c = 3;",
    );
  });

  it("shows the saved edit in diff mode", async () => {
    await mode("Diff mode").click();
    const modified = await waitForTextIn(
      diffEditor().locator(".editor.modified"),
      "c = 3",
    );
    expect(modified).toContain("export const b = 2;");
    expect(
      await textOf(diffEditor().locator(".editor.original")),
    ).not.toContain("c = 3");
    await mode("Editor mode").click();
  });

  it("keeps unsaved edits through a theme change, and saves them after", async () => {
    await waitForTextIn(editor(), "export const c = 3;");
    await editor().locator(".view-lines").click();
    await app.page.keyboard.press("Meta+ArrowDown");
    await app.page.keyboard.type("\nexport const d = 4;");

    await app.page.getByRole("button", { name: "Settings" }).click();
    await app.page.getByRole("button", { name: "Light", exact: true }).click();
    await app.page.keyboard.press("Escape");
    await app.page
      .locator("html[data-theme=light]")
      .waitFor({ state: "attached" });
    await editor().and(app.page.locator(".vs")).waitFor();
    expect(await textOf(editor())).toContain("export const d = 4;");

    await editor().locator(".view-lines").click();
    await app.page.keyboard.press("Meta+s");
    await until(
      () => read("src/a.ts").includes("export const d = 4;"),
      "the save",
    );
  });

  it("previews Markdown", async () => {
    await terminal.type("conduit open notes.md\n");
    await mode("Preview mode").click();
    await app.page
      .getByRole("heading", { level: 1, name: "E2E heading" })
      .waitFor();
    await app.page.getByText("Some bold text, edited.").waitFor();
  });

  it("loads the editor's icon font", async () => {
    const faces = await app.page.evaluate(async () =>
      (await document.fonts.load("16px codicon")).map((face) => face.status),
    );
    expect(faces.length).toBeGreaterThan(0);
    expect(faces.every((status) => status === "loaded")).toBe(true);
  });

  it("had no uncaught errors or failed loads", () => {
    expect(app.pageErrors).toEqual([]);
    expect(app.failedRequests).toEqual([]);
  });
});
