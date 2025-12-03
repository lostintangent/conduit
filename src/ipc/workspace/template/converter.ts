/**
 * Workspace Template Converter
 *
 * Converts between the YAML-friendly workspace template format (WorkspaceTemplate)
 * and the internal detailed workspace format (Workspace).
 *
 * The template format is designed to be human-readable and hand-authorable,
 * with smart defaults and type inference to minimize boilerplate.
 */

import type {
  BrowserPane,
  EditorPane,
  LayoutNode,
  LayoutPaneNode,
  LayoutSplitNode,
  Pane,
  PaneType,
  SplitDirection,
  TerminalPane,
  Workspace,
} from "@shared/types";
import { generateId } from "@shared/utils";
import type {
  TemplateLayoutNode,
  TemplatePane,
  TemplateSplit,
  TemplateTab,
  WorkspaceTemplate,
} from "./types";

/** Creates a terminal pane from a template pane definition */
function createTerminalPane(
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
function createBrowserPane(
  paneNode: TemplatePane,
  paneId: string,
): BrowserPane {
  const url = paneNode.url || (paneNode.devToolsFor ? "about:blank" : "");
  return {
    type: "browser",
    id: paneId,
    url: url,
  };
}

/** Creates an editor pane from a template pane definition */
function createEditorPane(
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
 * Priority: explicit type > terminal indicators > browser indicators > editor (default)
 */
function inferPaneType(paneNode: TemplatePane): PaneType {
  if (paneNode.type) {
    return paneNode.type;
  }
  if (paneNode.command || paneNode.cloneOf) {
    return "terminal";
  }
  if (paneNode.url || paneNode.devToolsFor) {
    return "browser";
  }
  return "editor";
}

/**
 * Converts a workspace template to the internal detailed format.
 *
 * @param template - The workspace template definition
 * @param cwd - Optional directory path for resolving relative paths
 *                  (e.g., the directory containing the imported YAML file)
 * @returns The fully expanded Workspace object
 */
export function convertTemplateToWorkspace(
  template: WorkspaceTemplate,
  cwd?: string,
): Workspace {
  const baseCwd = template.cwd || cwd || "";

  // Maps template ID -> Internal Pane ID (for resolving references like cloneOf, devToolsFor)
  const templateIdToPaneId = new Map<string, string>();

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
      const isSplit = "panes" in node;

      if (isSplit) {
        const splitNode = node as TemplateSplit;
        const direction: SplitDirection = splitNode.split || "row";
        const childrenNodes: LayoutNode[] = (splitNode.panes || []).map(
          (child) => processLayout(child, currentCwd),
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
        if (paneNode.cloneOf) {
          pendingClones.push({
            pane: pane as TerminalPane,
            targetTemplateId: paneNode.cloneOf,
          });
        }
      } else if (inferredType === "browser") {
        pane = createBrowserPane(paneNode, paneId);
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
    const targetId = templateIdToPaneId.get(item.targetTemplateId);
    if (targetId) {
      item.pane.cloneOf = targetId;
    } else {
      console.warn(
        `Could not resolve clone reference: ${item.targetTemplateId}`,
      );
    }
  }

  for (const item of pendingDevTools) {
    const targetId = templateIdToPaneId.get(item.targetTemplateId);
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

/**
 * Converts the internal detailed workspace format to a workspace template.
 *
 * The output is optimized for readability:
 * - Types are omitted when they can be inferred
 * - IDs are only included for panes that are referenced by others
 * - Common CWD is hoisted to the tab level
 * - DevTools URLs are omitted (they're auto-generated)
 *
 * @param workspace - The internal workspace object
 * @returns The workspace template definition
 */
export function convertWorkspaceToTemplate(
  workspace: Workspace,
): WorkspaceTemplate {
  const paneIdToTemplateId = new Map<string, string>();
  const referencedPaneIds = new Set<string>();

  // Pass 1: Scan for references to determine which panes need IDs
  for (const tab of workspace.tabs) {
    for (const pane of tab.panes) {
      if (pane.type === "terminal" && pane.cloneOf) {
        referencedPaneIds.add(pane.cloneOf);
      }
      if (pane.type === "browser" && pane.devToolsFor) {
        referencedPaneIds.add(pane.devToolsFor);
      }
    }
  }

  // Generate template IDs for referenced panes
  let idCounter = 1;
  function getOrGenerateTemplateId(paneId: string): string | undefined {
    if (paneIdToTemplateId.has(paneId)) {
      return paneIdToTemplateId.get(paneId);
    }
    if (referencedPaneIds.has(paneId)) {
      const templateId = `pane-${idCounter++}`;
      paneIdToTemplateId.set(paneId, templateId);
      return templateId;
    }
    return undefined;
  }

  referencedPaneIds.forEach((id) => getOrGenerateTemplateId(id));

  const templateTabs: TemplateTab[] = workspace.tabs.map((tab) => {
    // Calculate common CWD for the tab
    const paneCwds: string[] = [];
    for (const pane of tab.panes) {
      if ((pane.type === "terminal" || pane.type === "editor") && pane.cwd) {
        paneCwds.push(pane.cwd);
      }
    }

    const tabCwd: string | undefined =
      paneCwds.length > 0 && paneCwds.every((c) => c === paneCwds[0])
        ? paneCwds[0]
        : undefined;

    function processLayout(node: LayoutNode): TemplateLayoutNode {
      if (node.type === "split") {
        const split: TemplateSplit = {
          panes: node.children.map((child) => processLayout(child)),
        };
        if (node.direction !== "row") {
          split.split = node.direction;
        }
        return split;
      }

      const pane = tab.panes.find((p) => p.id === node.paneId);
      if (!pane) {
        return {};
      }

      const basePane: TemplatePane = {};
      let explicitTypeRequired = false;

      const templateId = paneIdToTemplateId.get(pane.id);
      if (templateId) {
        basePane.id = templateId;
      }

      if (tab.activePaneId === pane.id) {
        basePane.active = true;
      }

      if ((node as LayoutPaneNode).collapsed) {
        basePane.collapsed = true;
      }

      if (
        (pane.type === "terminal" || pane.type === "editor") &&
        pane.cwd &&
        pane.cwd !== tabCwd
      ) {
        basePane.cwd = pane.cwd;
      }

      if (pane.type === "terminal") {
        if (pane.command) {
          basePane.command = pane.command;
        }
        if (pane.cloneOf) {
          const targetTemplateId = getOrGenerateTemplateId(pane.cloneOf);
          if (targetTemplateId) {
            basePane.cloneOf = targetTemplateId;
          }
        }
        if (!basePane.command && !basePane.cloneOf) {
          explicitTypeRequired = true;
        }
      } else if (pane.type === "editor") {
        if (pane.file) {
          basePane.file = pane.file;
        }
      } else if (pane.type === "browser") {
        if (pane.devToolsFor) {
          const targetTemplateId = getOrGenerateTemplateId(pane.devToolsFor);
          if (targetTemplateId) {
            basePane.devToolsFor = targetTemplateId;
          }
        }
        if (pane.url && !basePane.devToolsFor) {
          basePane.url = pane.url;
        }
        if (!basePane.url && !basePane.devToolsFor) {
          explicitTypeRequired = true;
        }
      }

      if (explicitTypeRequired) {
        basePane.type = pane.type;
      }

      return basePane;
    }

    const templateTab = {
      ...tab,
      cwd: tabCwd,
      ...processLayout(tab.layout as LayoutNode),
    } as TemplateTab;

    if (workspace.activeTabId === tab.id) {
      templateTab.active = true;
    }

    return templateTab;
  });

  return {
    name: workspace.name,
    tabs: templateTabs,
  };
}
