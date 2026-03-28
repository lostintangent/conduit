import type { LayoutNode, LayoutPaneNode, Workspace } from "@shared/types";
import type {
  TemplateLayoutNode,
  TemplatePane,
  TemplateTab,
  WorkspaceTemplate,
} from "./types";
import { getPaneCwd } from "./utils";

/**
 * Converts the internal Conduit workspace to a portable template that can be shared/committed.
 *
 * @param workspace The workspace to convert.
 * @see docs/workspace.md for full format documentation
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
      }
      if (pane.type === "browser") {
        if (pane.url) {
          paneIdToUrl.set(pane.id, pane.url);
        }
        if (pane.devToolsFor) {
          referencedPaneIds.add(pane.devToolsFor);
        }
      }
      const cwd = getPaneCwd(pane);
      if (cwd) {
        allPaneCwds.push(cwd);
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
      const cwd = getPaneCwd(pane);
      if (cwd) {
        paneCwds.push(cwd);
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
      const paneCwd = getPaneCwd(pane);
      const hasDifferentCwd = paneCwd && paneCwd !== effectiveTabCwd;

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
          !pane.chromeless &&
          !needsActiveMarker &&
          !isCollapsed &&
          !needsExplicitId(pane.id, "browser");

        if (canUseShorthand) {
          return pane.url as string;
        }
      }

      if (pane.type === "editor") {
        const canUseShorthand =
          !needsActiveMarker &&
          !isCollapsed &&
          !hasDifferentCwd &&
          !pane.preview;

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
        basePane.cwd = paneCwd;
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
        if (pane.preview) {
          basePane.preview = true;
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
        if (pane.chromeless) {
          basePane.chromeless = true;
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
