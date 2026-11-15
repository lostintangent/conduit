import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCommandRegistry, getKeybindingRegistry } from "@/commands";
import type { Disposable } from "@/commands/core/types";
import { ApplicationCommands } from "@shared/commands";
import { type PageMenuParams, pageMenu } from "./pageMenu";
import { searchUrl } from "./url";

const writeClipboard = vi.fn();
const copyImageAt = vi.fn();
const inspectElement = vi.fn();
window.conduit = {
  workbench: { writeClipboard },
  browser: { copyImageAt, inspectElement },
} as never;

const webview = {
  canGoBack: vi.fn(() => false),
  canGoForward: vi.fn(() => true),
  goBack: vi.fn(),
  goForward: vi.fn(),
  reload: vi.fn(),
  cut: vi.fn(),
  copy: vi.fn(),
  paste: vi.fn(),
  selectAll: vi.fn(),
  getWebContentsId: () => 7,
  getBoundingClientRect: () => ({ left: 0, top: 4 }) as DOMRect,
  getZoomFactor: () => 2,
};
const openPage = vi.fn();
const openDevTools = vi.fn();

const noEdits = {
  canUndo: false,
  canRedo: false,
  canCut: false,
  canCopy: false,
  canPaste: false,
  canDelete: false,
  canSelectAll: false,
  canEditRichly: false,
};

/** A right-click on an empty spot of the page, with what was under it */
const at = (params: Partial<PageMenuParams> = {}): PageMenuParams => ({
  x: 10,
  y: 20,
  linkURL: "",
  linkText: "",
  selectionText: "",
  isEditable: false,
  editFlags: noEdits,
  mediaType: "none",
  srcURL: "",
  ...params,
});

/** The menu's items as "group: title [key] (disabled)" */
function menu(params: PageMenuParams, showToolbar?: () => void) {
  return pageMenu(params, { webview, openPage, openDevTools, showToolbar }).map(
    ({ group, title, keybinding, enabled }) =>
      [
        `${group.replace(/^\d+_/, "")}: ${title}`,
        keybinding && `[${keybinding}]`,
        enabled === false && "(disabled)",
      ]
        .filter(Boolean)
        .join(" "),
  );
}

function run(params: PageMenuParams, title: string) {
  pageMenu(params, { webview, openPage, openDevTools })
    .find((action) => action.title === title)!
    .run();
}

describe("pageMenu", () => {
  let commands: Disposable[];

  beforeEach(() => {
    vi.clearAllMocks();
    commands = [
      [ApplicationCommands.BROWSER_GO_BACK, "Cmd+["],
      [ApplicationCommands.BROWSER_GO_FORWARD, "Cmd+]"],
      [ApplicationCommands.BROWSER_RELOAD, "Cmd+R"],
    ].map(([id, key]) =>
      getCommandRegistry().registerCommand({
        id,
        title: id,
        keybinding: { key },
        run: () => {},
      }),
    );
  });

  afterEach(() => {
    for (const command of commands) command.dispose();
    getKeybindingRegistry().clear();
  });

  it("goes back, forward and reloads anywhere, greying out where there's nowhere to go", () => {
    expect(menu(at())).toEqual([
      "navigation: Back [Cmd+[] (disabled)",
      "navigation: Forward [Cmd+]]",
      "navigation: Reload [Cmd+R]",
      "inspect: Inspect Element",
    ]);

    run(at(), "Forward");
    expect(webview.goForward).toHaveBeenCalledOnce();
    run(at(), "Reload");
    expect(webview.reload).toHaveBeenCalledOnce();
  });

  it("shows the toolbar only while it's hidden", () => {
    const showToolbar = vi.fn();
    expect(menu(at(), showToolbar).at(-2)).toBe("navigation: Show Toolbar");

    pageMenu(at(), { webview, openPage, openDevTools, showToolbar })
      .at(-2)!
      .run();
    expect(showToolbar).toHaveBeenCalledOnce();
  });

  it("inspects the element under the pointer in the page's DevTools pane", async () => {
    let noted!: () => void;
    inspectElement.mockReturnValueOnce(
      new Promise<void>((resolve) => (noted = resolve)),
    );
    run(at(), "Inspect Element");

    // Where that is in the window, and in the page at its zoom
    expect(inspectElement).toHaveBeenCalledExactlyOnceWith(7, 10, 20, {
      x: 5,
      y: 8,
    });
    // Main notes what's under the pointer before a DevTools pane reshapes the
    // page
    expect(openDevTools).not.toHaveBeenCalled();
    noted();
    await vi.waitFor(() => expect(openDevTools).toHaveBeenCalledOnce());
  });

  it("opens a link in a new pane and copies it", () => {
    const link = at({ linkURL: "https://example.com/a" });
    expect(menu(link).slice(0, 2)).toEqual([
      "link: Open Link in New Pane",
      "link: Copy Link",
    ]);

    run(link, "Open Link in New Pane");
    expect(openPage).toHaveBeenCalledWith("https://example.com/a");
    run(link, "Copy Link");
    expect(writeClipboard).toHaveBeenCalledWith("https://example.com/a");
  });

  it("copies a selection and searches for it, shortening a long one in the menu", () => {
    const selection = at({
      selectionText: " Conduit keeps\n  terminals and agents together ",
    });
    expect(menu(selection).slice(0, 2)).toEqual([
      "selection: Copy [Cmd+C]",
      "selection: Search Bing for “Conduit keeps terminals…”",
    ]);
    expect(menu(at({ selectionText: "Conduit" }))[1]).toBe(
      "selection: Search Bing for “Conduit”",
    );

    run(selection, "Copy");
    expect(webview.copy).toHaveBeenCalledOnce();
    run(selection, "Search Bing for “Conduit keeps terminals…”");
    expect(openPage).toHaveBeenCalledWith(
      searchUrl("Conduit keeps terminals and agents together"),
    );
  });

  it("leaves out a link's own text, which the page selects as it's right-clicked", () => {
    const link = at({
      linkURL: "https://example.com/",
      linkText: "Example  site",
      selectionText: "Example site",
    });
    expect(menu(link).slice(0, 3)).toEqual([
      "link: Open Link in New Pane",
      "link: Copy Link",
      "navigation: Back [Cmd+[] (disabled)",
    ]);
  });

  it("puts a selected link's items before its selection's", () => {
    expect(
      menu(at({ linkURL: "https://example.com/", selectionText: "Example" })),
    ).toEqual([
      "link: Open Link in New Pane",
      "link: Copy Link",
      "selection: Copy [Cmd+C]",
      "selection: Search Bing for “Example”",
      "navigation: Back [Cmd+[] (disabled)",
      "navigation: Forward [Cmd+]]",
      "navigation: Reload [Cmd+R]",
      "inspect: Inspect Element",
    ]);
  });

  it("only edits in a text field, as far as it can", () => {
    const field = at({
      isEditable: true,
      selectionText: "typed",
      editFlags: { ...noEdits, canCopy: true, canPaste: true },
    });
    expect(menu(field).slice(0, 4)).toEqual([
      "edit: Cut [Cmd+X] (disabled)",
      "edit: Copy [Cmd+C]",
      "edit: Paste [Cmd+V]",
      "edit: Select All [Cmd+A] (disabled)",
    ]);
    expect(menu(field)[4]).toBe("navigation: Back [Cmd+[] (disabled)");

    run(field, "Paste");
    expect(webview.paste).toHaveBeenCalledOnce();
  });

  it("copies an image and its address", () => {
    const image = at({
      mediaType: "image",
      srcURL: "https://example.com/a.png",
    });
    expect(menu(image).slice(0, 2)).toEqual([
      "image: Copy Image",
      "image: Copy Image Address",
    ]);

    run(image, "Copy Image");
    expect(copyImageAt).toHaveBeenCalledWith(7, 10, 20);
    run(image, "Copy Image Address");
    expect(writeClipboard).toHaveBeenCalledWith("https://example.com/a.png");
  });
});
