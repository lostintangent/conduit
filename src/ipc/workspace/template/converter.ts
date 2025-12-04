/**
 * Workspace Template Converter
 *
 * Converts between YAML-friendly WorkspaceTemplate and internal Workspace format.
 *
 * @see docs/workspace.md for full format documentation
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
 * Priority: explicit type > browser indicators > editor indicators > terminal (default)
 */
function inferPaneType(paneNode: TemplatePane): PaneType {
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
function normalizePaneInput(
  input: TemplateLayoutNode,
): TemplatePane | TemplateSplit {
  if (input === null || input === "") {
    return {}; // Empty terminal (terminal is default type)
  }
  if (typeof input === "string") {
    // URLs starting with http:// or https:// become browser panes
    if (input.startsWith("http://") || input.startsWith("https://")) {
      return { url: input };
    }
    // file:// prefix becomes editor pane
    if (input.startsWith("file://")) {
      const filePath = input.slice(7); // Remove "file://" prefix
      return filePath ? { type: "editor", file: filePath } : { type: "editor" };
    }
    // Everything else is a terminal command
    return { command: input };
  }
  return input;
}

/**
 * Converts a workspace template to the internal detailed format.
 *
 * @param template - The workspace template definition (from YAML)
 * @param cwd - Optional base directory for resolving relative paths
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

/**
 * Converts the internal workspace format to a minimal template for YAML export.
 *
 * @param workspace - The internal workspace object
 */
export function convertWorkspaceToTemplate(
  workspace: Workspace,
): WorkspaceTemplate {
  // Maps for resolving references - prefer command/URL over generated IDs
  const paneIdToCommand = new Map<string, string>();
  const paneIdToUrl = new Map<string, string>();
  const paneIdToGeneratedId = new Map<string, string>();
  const referencedPaneIds = new Set<string>();

  // Pass 1: Build maps, scan for references, and collect all CWDs
  const allPaneCwds: string[] = [];
  for (const tab of workspace.tabs) {
    for (const pane of tab.panes) {
      if (pane.type === "terminal") {
        if (pane.command) {
          paneIdToCommand.set(pane.id, pane.command);
        }
        if (pane.cloneOf) {
          referencedPaneIds.add(pane.cloneOf);
        }
        if (pane.cwd) {
          allPaneCwds.push(pane.cwd);
        }
      }
      if (pane.type === "browser") {
        if (pane.url) {
          paneIdToUrl.set(pane.id, pane.url);
        }
        if (pane.devToolsFor) {
          referencedPaneIds.add(pane.devToolsFor);
        }
      }
      if (pane.type === "editor" && pane.cwd) {
        allPaneCwds.push(pane.cwd);
      }
    }
  }

  // Calculate workspace-level common CWD
  const workspaceCwd: string | undefined =
    allPaneCwds.length > 0 && allPaneCwds.every((c) => c === allPaneCwds[0])
      ? allPaneCwds[0]
      : undefined;

  // Generate IDs only for referenced panes that don't have command/URL
  let idCounter = 1;
  function getTemplateReference(
    paneId: string,
    type: "terminal" | "browser",
  ): string | undefined {
    // For terminals, prefer command string
    if (type === "terminal") {
      const command = paneIdToCommand.get(paneId);
      if (command) return command;
    }
    // For browsers, prefer URL string
    if (type === "browser") {
      const url = paneIdToUrl.get(paneId);
      if (url) return url;
    }
    // Fall back to generated ID
    if (!paneIdToGeneratedId.has(paneId) && referencedPaneIds.has(paneId)) {
      paneIdToGeneratedId.set(paneId, `pane-${idCounter++}`);
    }
    return paneIdToGeneratedId.get(paneId);
  }

  // Check if a pane needs an explicit ID (referenced but has no command/URL)
  function needsExplicitId(
    paneId: string,
    type: "terminal" | "browser",
  ): boolean {
    if (!referencedPaneIds.has(paneId)) return false;
    if (type === "terminal" && paneIdToCommand.has(paneId)) return false;
    if (type === "browser" && paneIdToUrl.has(paneId)) return false;
    return true;
  }

  const templateTabs: TemplateTab[] = workspace.tabs.map((tab, tabIndex) => {
    // Calculate common CWD for the tab (only if different from workspace CWD)
    const paneCwds: string[] = [];
    for (const pane of tab.panes) {
      if ((pane.type === "terminal" || pane.type === "editor") && pane.cwd) {
        paneCwds.push(pane.cwd);
      }
    }

    const tabCommonCwd: string | undefined =
      paneCwds.length > 0 && paneCwds.every((c) => c === paneCwds[0])
        ? paneCwds[0]
        : undefined;

    // Only include tab CWD if it differs from workspace CWD
    const tabCwd = tabCommonCwd !== workspaceCwd ? tabCommonCwd : undefined;
    // Use effective CWD for pane comparisons (tab's actual CWD, whether explicit or inherited)
    const effectiveTabCwd = tabCommonCwd || workspaceCwd;

    // Track first pane to avoid redundant active: true
    let firstPaneId: string | null = null;

    function processLayout(node: LayoutNode): TemplateLayoutNode {
      if (node.type === "split") {
        const children = node.children.map((child) => processLayout(child));
        if (node.direction === "column") {
          return { column: children };
        }
        return { row: children };
      }

      const pane = tab.panes.find((p) => p.id === node.paneId);
      if (!pane) {
        return {};
      }

      // Track first pane encountered
      if (firstPaneId === null) {
        firstPaneId = pane.id;
      }

      const layoutNode = node as LayoutPaneNode;
      const isActive = tab.activePaneId === pane.id;
      const isFirstPane = pane.id === firstPaneId;
      // Only mark active if it's not the first pane (first is default)
      const needsActiveMarker = isActive && !isFirstPane;
      const isCollapsed = layoutNode.collapsed;
      const hasDifferentCwd =
        (pane.type === "terminal" || pane.type === "editor") &&
        pane.cwd &&
        pane.cwd !== effectiveTabCwd;

      // Check if we can use string shorthand (or null for empty terminal)
      if (pane.type === "terminal") {
        const canUseShorthand =
          !pane.cloneOf &&
          !needsActiveMarker &&
          !isCollapsed &&
          !hasDifferentCwd &&
          !needsExplicitId(pane.id, "terminal");

        if (canUseShorthand) {
          // Return command string, or null for empty terminal
          return pane.command || null;
        }
      }

      if (pane.type === "browser") {
        const canUseShorthand =
          pane.url &&
          !pane.devToolsFor &&
          !needsActiveMarker &&
          !isCollapsed &&
          !needsExplicitId(pane.id, "browser");

        if (canUseShorthand) {
          return pane.url as string;
        }
      }

      if (pane.type === "editor") {
        const canUseShorthand =
          !needsActiveMarker && !isCollapsed && !hasDifferentCwd;

        if (canUseShorthand) {
          // Return file:// or file://<path>
          return pane.file ? `file://${pane.file}` : "file://";
        }
      }

      // Build object form
      const basePane: TemplatePane = {};
      let explicitTypeRequired = false;

      // Add explicit ID only if needed
      if (pane.type === "terminal" && needsExplicitId(pane.id, "terminal")) {
        basePane.id = getTemplateReference(pane.id, "terminal");
      }
      if (pane.type === "browser" && needsExplicitId(pane.id, "browser")) {
        basePane.id = getTemplateReference(pane.id, "browser");
      }

      if (needsActiveMarker) {
        basePane.active = true;
      }

      if (isCollapsed) {
        basePane.collapsed = true;
      }

      if (hasDifferentCwd) {
        basePane.cwd = (pane as TerminalPane | EditorPane).cwd!;
      }

      if (pane.type === "terminal") {
        if (pane.command) {
          basePane.command = pane.command;
        }
        if (pane.cloneOf) {
          const ref = getTemplateReference(pane.cloneOf, "terminal");
          if (ref) {
            basePane.cloneOf = ref;
          }
        }
      } else if (pane.type === "editor") {
        if (pane.file) {
          basePane.file = pane.file;
        }
        // Editor panes need explicit type unless they have a file
        if (!pane.file) {
          explicitTypeRequired = true;
        }
      } else if (pane.type === "browser") {
        if (pane.devToolsFor) {
          const ref = getTemplateReference(pane.devToolsFor, "browser");
          if (ref) {
            basePane.devToolsFor = ref;
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

    // Process layout, but use "panes" instead of "row" for top-level horizontal splits
    const layoutResult = processLayout(tab.layout as LayoutNode);
    let topLevelLayout: Record<string, unknown>;
    if (
      typeof layoutResult === "object" &&
      layoutResult !== null &&
      "row" in layoutResult
    ) {
      topLevelLayout = { panes: layoutResult.row };
    } else if (typeof layoutResult === "object" && layoutResult !== null) {
      topLevelLayout = layoutResult as Record<string, unknown>;
    } else {
      // Single pane (string or null) - wrap in panes array
      topLevelLayout = { panes: [layoutResult] };
    }

    // Only include template-relevant properties (exclude id, layout, activePaneId, panes array)
    const templateTab: TemplateTab = {
      name: tab.name,
      ...(tabCwd && { cwd: tabCwd }),
      ...topLevelLayout,
    } as TemplateTab;

    // Only mark active if it's not the first tab (first is default)
    if (workspace.activeTabId === tab.id && tabIndex !== 0) {
      templateTab.active = true;
    }

    return templateTab;
  });

  return {
    name: workspace.name,
    ...(workspaceCwd && { cwd: workspaceCwd }),
    tabs: templateTabs,
  };
}
