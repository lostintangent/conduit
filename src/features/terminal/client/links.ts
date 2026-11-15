import { WebLinksAddon } from "@xterm/addon-web-links";
import type { Terminal } from "@xterm/xterm";

/** Follows a terminal's link, in a new pane when `newPane` is set */
export type LinkHandler = (url: string, newPane: boolean) => void;

/**
 * Handles a terminal's links, both the web addresses in its text and the
 * hyperlinks programs print (OSC 8). They open on Cmd-click, or in a new pane
 * on Cmd-Shift-click. As in iTerm, they only look clickable while Cmd is down,
 * and a plain click on one just clicks the terminal.
 */
export function handleLinks(terminal: Terminal, follow: LinkHandler) {
  const showPointer = (event: MouseEvent | KeyboardEvent) => {
    // A terminal that closes while its link is hovered never leaves it
    if (!terminal.element?.isConnected) return stopShowing();
    terminal.element.classList.toggle("xterm-link-needs-cmd", !event.metaKey);
  };
  // Cmd pressed while a page has the keys only shows as the pointer moves
  const startShowing = (event: MouseEvent) => {
    showPointer(event);
    window.addEventListener("keydown", showPointer, true);
    window.addEventListener("keyup", showPointer, true);
    terminal.element?.addEventListener("mousemove", showPointer);
  };
  const stopShowing = () => {
    terminal.element?.classList.remove("xterm-link-needs-cmd");
    window.removeEventListener("keydown", showPointer, true);
    window.removeEventListener("keyup", showPointer, true);
    terminal.element?.removeEventListener("mousemove", showPointer);
  };

  const activate = (event: MouseEvent, url: string) => {
    if (event.metaKey) follow(url, event.shiftKey);
  };
  const looks = { hover: startShowing, leave: stopShowing };

  terminal.loadAddon(new WebLinksAddon(activate, looks));
  // Like web addresses, hyperlinks only open http and https
  terminal.options.linkHandler = { activate, ...looks };
}

/**
 * Keeps a Cmd-click on a link to the link. Otherwise its pane would take it as
 * entering focus mode, a Cmd-Shift-click would also extend the selection, as a
 * Shift-click does, and focus would move. xterm notes the link on its screen
 * before the click reaches the terminal around it.
 */
export function claimLinkClicks(terminal: Terminal) {
  const screen = terminal.element?.querySelector<HTMLElement>(".xterm-screen");
  screen?.addEventListener("mousedown", (event) => {
    if (event.metaKey && screen.classList.contains("xterm-cursor-pointer")) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}
