/**
 * Shared utilities for workspace template conversion.
 */

import type {
  BrowserPane,
  EditorPane,
  Pane,
  PaneType,
  TerminalPane,
} from "@shared/types";
import type { TemplateLayoutNode, TemplatePane, TemplateSplit } from "./types";

/** Check if a string is an HTTP/HTTPS URL */
export const isHttpUrl = (s: string) =>
  s.startsWith("http://") || s.startsWith("https://");

/** Check if a string is a file:// URL */
export const isFileUrl = (s: string) => s.startsWith("file://");

/** Get CWD from a pane (only terminal/editor have CWD) */
export const getPaneCwd = (pane: Pane): string | undefined =>
  pane.type === "terminal" || pane.type === "editor" ? pane.cwd : undefined;

/** Creates a terminal pane from a template pane definition */
export function createTerminalPane(
  paneNode: TemplatePane,
  paneId: string,
  paneCwd: string,
): TerminalPane {
  return {
    type: "terminal",
    id: paneId,
    cwd: paneCwd,
    command: paneNode.command,
  };
}

/** Creates a browser pane from a template pane definition */
export function createBrowserPane(
  paneNode: TemplatePane,
  paneId: string,
): BrowserPane {
  const url = paneNode.url || (paneNode.devToolsFor ? "about:blank" : "");
  return {
    type: "browser",
    id: paneId,
    url,
    ...(paneNode.chromeless && { chromeless: true }),
  };
}

/** Creates an editor pane from a template pane definition */
export function createEditorPane(
  paneNode: TemplatePane,
  paneId: string,
  paneCwd: string,
): EditorPane {
  return {
    type: "editor",
    id: paneId,
    cwd: paneCwd,
    file: paneNode.file,
    treeMode: "all",
  };
}

/**
 * Infers the pane type from a template pane definition.
 * Priority: explicit type > browser indicators > editor indicators > terminal (default)
 */
export function inferPaneType(paneNode: TemplatePane): PaneType {
  if (paneNode.type) {
    return paneNode.type;
  }
  if (paneNode.url || paneNode.devToolsFor) {
    return "browser";
  }
  if (paneNode.file || paneNode.treeMode) {
    return "editor";
  }
  return "terminal";
}

/** Normalizes string/null shorthand to TemplatePane or TemplateSplit object */
export function normalizePaneInput(
  input: TemplateLayoutNode,
): TemplatePane | TemplateSplit {
  if (input === null || input === "") {
    return {}; // Empty terminal (terminal is default type)
  }
  if (typeof input === "string") {
    // URLs starting with http:// or https:// become browser panes
    if (isHttpUrl(input)) {
      return { url: input };
    }
    // file:// prefix becomes editor pane
    if (isFileUrl(input)) {
      const filePath = input.slice(7); // Remove "file://" prefix
      return filePath ? { type: "editor", file: filePath } : { type: "editor" };
    }
    // Everything else is a terminal command
    return { command: input };
  }
  return input;
}
