import type {
  BrowserPane,
  LayoutNode,
  LayoutPaneNode,
  LayoutSplitNode,
  Pane,
  SplitDirection,
  TerminalPane,
  Workspace,
} from "@shared/types";
import { generateId } from "@shared/utils";
import type {
  TemplateLayoutNode,
  TemplatePane,
  TemplateSplit,
  WorkspaceTemplate,
} from "./types";
import {
  createBrowserPane,
  createEditorPane,
  createTerminalPane,
  inferPaneType,
  normalizePaneInput,
} from "./utils";

/**
 * Converts a portable workspace template to the internal workspace state.
 *
 * @param template - The workspace template's content (imported from a YAML file)
 * @param cwd - Optional base directory for resolving relative paths
 *
 * @see docs/workspace.md for full format documentation
 */
export function convertTemplateToWorkspace(
  template: WorkspaceTemplate,
  cwd?: string,
): Workspace {
  const baseCwd = template.cwd || cwd || "";

  // Maps template ID -> Internal Pane ID (for resolving references like cloneOf, devToolsFor)
  const templateIdToPaneId = new Map<string, string>();

  // Maps command string -> Internal Pane ID (for cloneOf by command)
  const commandToPaneId = new Map<string, string>();

  // Maps URL string -> Internal Pane ID (for devToolsFor by URL)
  const urlToPaneId = new Map<string, string>();

  // Store pending reference resolutions
  const pendingClones: { pane: TerminalPane; targetTemplateId: string }[] = [];
  const pendingDevTools: { pane: BrowserPane; targetTemplateId: string }[] = [];

  let workspaceActiveTabId = "";

  const tabs: Workspace["tabs"] = template.tabs.map((templateTab) => {
    const tabId = generateId();
    const tabCwd = templateTab.cwd || baseCwd;

    if (templateTab.active) {
      workspaceActiveTabId = tabId;
    }

    const panesMap: Record<string, Pane> = {};
    let explicitActivePaneId = "";

    function processLayout(
      node: TemplateLayoutNode,
      currentCwd: string,
    ): LayoutNode {
      // Handle null/empty string and string shorthand first
      if (node === null || node === "" || typeof node === "string") {
        return processLayout(normalizePaneInput(node), currentCwd);
      }

      const isSplit = "row" in node || "column" in node || "panes" in node;

      if (isSplit) {
        const splitNode = node as TemplateSplit;
        const direction: SplitDirection = "column" in node ? "column" : "row";
        const children =
          splitNode.column || splitNode.row || splitNode.panes || [];
        const childrenNodes: LayoutNode[] = children.map((child) =>
          processLayout(normalizePaneInput(child), currentCwd),
        );

        return {
          type: "split",
          direction,
          children: childrenNodes,
          id: generateId(),
        } as LayoutSplitNode;
      }

      // It's a pane leaf node
      const paneNode = node as TemplatePane;
      const paneId = generateId();
      const paneCwd = paneNode.cwd || currentCwd;

      if (paneNode.id) {
        templateIdToPaneId.set(paneNode.id, paneId);
      }

      if (paneNode.active) {
        explicitActivePaneId = paneId;
      }

      const inferredType = inferPaneType(paneNode);
      let pane: Pane;

      if (inferredType === "terminal") {
        pane = createTerminalPane(paneNode, paneId, paneCwd);
        // Register command for cloneOf lookup (first terminal with this command wins)
        if (paneNode.command && !commandToPaneId.has(paneNode.command)) {
          commandToPaneId.set(paneNode.command, paneId);
        }
        if (paneNode.cloneOf) {
          pendingClones.push({
            pane: pane as TerminalPane,
            targetTemplateId: paneNode.cloneOf,
          });
        }
      } else if (inferredType === "browser") {
        pane = createBrowserPane(paneNode, paneId);
        // Register URL for devToolsFor lookup (first browser with this URL wins)
        if (paneNode.url && !urlToPaneId.has(paneNode.url)) {
          urlToPaneId.set(paneNode.url, paneId);
        }
        if (paneNode.devToolsFor) {
          pendingDevTools.push({
            pane: pane as BrowserPane,
            targetTemplateId: paneNode.devToolsFor,
          });
        }
      } else {
        pane = createEditorPane(paneNode, paneId, paneCwd);
      }

      panesMap[paneId] = pane;

      return {
        type: "pane",
        paneId: paneId,
        id: generateId(),
        collapsed: paneNode.collapsed,
      } as LayoutPaneNode;
    }

    const rootLayout = processLayout(templateTab, tabCwd);

    // Find active pane ID (first one if not explicit)
    let activePaneId = explicitActivePaneId;
    if (!activePaneId) {
      const findFirstPane = (node: LayoutNode): void => {
        if (activePaneId) return;
        if (node.type === "pane") {
          activePaneId = node.paneId;
        } else if (node.children.length > 0) {
          findFirstPane(node.children[0]);
        }
      };
      findFirstPane(rootLayout);
    }

    return {
      ...templateTab,
      id: tabId,
      panes: Object.values(panesMap),
      layout: rootLayout,
      activePaneId,
    };
  });

  // Second pass: Resolve cross-pane references
  for (const item of pendingClones) {
    // First try explicit ID, then fall back to command string
    const targetId =
      templateIdToPaneId.get(item.targetTemplateId) ||
      commandToPaneId.get(item.targetTemplateId);
    if (targetId) {
      item.pane.cloneOf = targetId;
    } else {
      console.warn(
        `Could not resolve clone reference: ${item.targetTemplateId}`,
      );
    }
  }

  for (const item of pendingDevTools) {
    // First try explicit ID, then fall back to URL string
    const targetId =
      templateIdToPaneId.get(item.targetTemplateId) ||
      urlToPaneId.get(item.targetTemplateId);
    if (targetId) {
      item.pane.devToolsFor = targetId;
    } else {
      console.warn(
        `Could not resolve devTools reference: ${item.targetTemplateId}`,
      );
    }
  }

  // Fallback for workspace active tab
  if (!workspaceActiveTabId && tabs.length > 0) {
    workspaceActiveTabId = tabs[0].id;
  }

  return {
    name: template.name,
    lastModified: Date.now(),
    tabs,
    activeTabId: workspaceActiveTabId,
  };
}
