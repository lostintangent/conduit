import { getKeybindingRegistry } from "@/commands";
import { formatKeybindingForElectron } from "@/commands/keybindings/utils";
import type { ContextMenuAction } from "@/commands/menus/types";
import { ApplicationCommands } from "@shared/commands";
import type { ContextMenuParams, WebviewTag } from "electron";
import { searchUrl } from "./url";

/** What was under the pointer when the page was right-clicked */
export type PageMenuParams = Pick<
  ContextMenuParams,
  | "x"
  | "y"
  | "linkURL"
  | "linkText"
  | "selectionText"
  | "isEditable"
  | "editFlags"
  | "mediaType"
  | "srcURL"
>;

type PageMenuTarget = {
  webview: Pick<
    WebviewTag,
    | "canGoBack"
    | "canGoForward"
    | "goBack"
    | "goForward"
    | "reload"
    | "cut"
    | "copy"
    | "paste"
    | "selectAll"
    | "getWebContentsId"
  >;
  /** Opens a page in a new pane */
  openPage: (url: string) => void;
  /** Shows the pane's toolbar, given only while it's hidden */
  showToolbar?: () => void;
};

/** How much of a selection the search item quotes */
const SEARCH_LABEL_LENGTH = 24;

const collapseSpaces = (text: string) => text.trim().replace(/\s+/g, " ");

/** The command's shortcut, for a menu item that does the same thing */
function keybindingOf(commandId: string) {
  const [keybinding] =
    getKeybindingRegistry().getKeybindingsForCommand(commandId);
  return keybinding
    ? formatKeybindingForElectron(keybinding.chords)
    : undefined;
}

function quoted(text: string) {
  const label =
    text.length > SEARCH_LABEL_LENGTH
      ? `${text.slice(0, SEARCH_LABEL_LENGTH).trimEnd()}…`
      : text;
  return `“${label}”`;
}

/**
 * A browser pane's right-click menu for what's under the pointer, combined
 * the way Safari does: a link, then a selection, or only editing in a text
 * field, with going back, forward and reloading always below
 */
export function pageMenu(
  params: PageMenuParams,
  { webview, openPage, showToolbar }: PageMenuTarget,
): ContextMenuAction[] {
  const actions: ContextMenuAction[] = [];
  const copyToClipboard = (text: string) =>
    window.conduit.workbench.writeClipboard(text);

  if (params.isEditable) {
    const { editFlags } = params;
    actions.push(
      {
        group: "3_edit",
        title: "Cut",
        keybinding: "Cmd+X",
        enabled: editFlags.canCut,
        run: () => webview.cut(),
      },
      {
        group: "3_edit",
        title: "Copy",
        keybinding: "Cmd+C",
        enabled: editFlags.canCopy,
        run: () => webview.copy(),
      },
      {
        group: "3_edit",
        title: "Paste",
        keybinding: "Cmd+V",
        enabled: editFlags.canPaste,
        run: () => webview.paste(),
      },
      {
        group: "3_edit",
        title: "Select All",
        keybinding: "Cmd+A",
        enabled: editFlags.canSelectAll,
        run: () => webview.selectAll(),
      },
    );
  } else {
    const { linkURL, srcURL } = params;
    // Right-clicking a link selects its text, which isn't the user's selection
    const selected = collapseSpaces(params.selectionText);
    const selection =
      linkURL && selected === collapseSpaces(params.linkText) ? "" : selected;

    if (linkURL) {
      actions.push(
        {
          group: "1_link",
          title: "Open Link in New Pane",
          run: () => openPage(linkURL),
        },
        {
          group: "1_link",
          title: "Copy Link",
          run: () => copyToClipboard(linkURL),
        },
      );
    }

    if (selection) {
      actions.push(
        {
          group: "2_selection",
          title: "Copy",
          keybinding: "Cmd+C",
          run: () => webview.copy(),
        },
        {
          group: "2_selection",
          title: `Search Bing for ${quoted(selection)}`,
          run: () => openPage(searchUrl(selection)),
        },
      );
    }

    if (params.mediaType === "image") {
      actions.push(
        {
          group: "4_image",
          title: "Copy Image",
          run: () =>
            window.conduit.browser.copyImageAt(
              webview.getWebContentsId(),
              params.x,
              params.y,
            ),
        },
        {
          group: "4_image",
          title: "Copy Image Address",
          run: () => copyToClipboard(srcURL),
        },
      );
    }
  }

  actions.push(
    {
      group: "5_navigation",
      title: "Back",
      keybinding: keybindingOf(ApplicationCommands.BROWSER_GO_BACK),
      enabled: webview.canGoBack(),
      run: () => webview.goBack(),
    },
    {
      group: "5_navigation",
      title: "Forward",
      keybinding: keybindingOf(ApplicationCommands.BROWSER_GO_FORWARD),
      enabled: webview.canGoForward(),
      run: () => webview.goForward(),
    },
    {
      group: "5_navigation",
      title: "Reload",
      keybinding: keybindingOf(ApplicationCommands.BROWSER_RELOAD),
      run: () => webview.reload(),
    },
  );

  if (showToolbar) {
    actions.push({
      group: "5_navigation",
      title: "Show Toolbar",
      run: showToolbar,
    });
  }

  return actions;
}
