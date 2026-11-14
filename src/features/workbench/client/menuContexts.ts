import {
  registerMenuContextBuilder,
  type MenuContextBuilder,
} from "@/commands/menus/menuContextBuilders";
import {
  hasGitRepo,
  paneCanBeCollapsed,
  paneIsCollapsed,
  tabHasWorktrees,
  tabIsLocked,
} from "@/commands/contextKeys/appContextKeys";
import { MenuId } from "@/commands/menus/types";
import type { Tab } from "@features/workbench/model";
import { walkLayout } from "@features/workbench/client/layout";

/**
 * Context builder for tab context menu
 *
 * Updates context keys based on the active pane in the tab.
 */
const tabContextBuilder: MenuContextBuilder = async (
  contextKeyService,
  params,
  checkGitRepo,
) => {
  const tab: Tab = params.tab;

  // Get the active pane
  const activePane = tab.panes[tab.activePaneId];

  // Check git repository status for agent commands
  let hasGitRepoValue = false;
  if (
    activePane &&
    (activePane.type === "terminal" || activePane.type === "editor")
  ) {
    hasGitRepoValue = await checkGitRepo(activePane.cwd);
  }

  // Check if the tab has any panes with active worktrees
  let hasWorktreesValue = false;
  for (const pane of Object.values(tab.panes)) {
    if (
      (pane.type === "terminal" || pane.type === "editor") &&
      pane.agentWorktreePath
    ) {
      hasWorktreesValue = true;
      break;
    }
  }

  contextKeyService.setGlobal(hasGitRepo.key, hasGitRepoValue);
  contextKeyService.setGlobal(tabIsLocked.key, tab.locked);
  contextKeyService.setGlobal(tabHasWorktrees.key, hasWorktreesValue);
};

/**
 * Context builder for pane context menu
 *
 * Updates context keys based on the specific pane being right-clicked.
 */
const paneContextBuilder: MenuContextBuilder = async (
  contextKeyService,
  params,
  checkGitRepo,
) => {
  const { pane, tab } = params;

  // Check git repository status for agent commands
  let hasGitRepoValue = false;
  if (pane && (pane.type === "terminal" || pane.type === "editor")) {
    hasGitRepoValue = await checkGitRepo(pane.cwd);
  }

  contextKeyService.setGlobal(hasGitRepo.key, hasGitRepoValue);
  if (tab) {
    contextKeyService.setGlobal(tabIsLocked.key, tab.locked);
  }

  let isPaneCollapsed = false;
  let canPaneBeCollapsed = false;

  if (pane && tab) {
    // Find the pane in the layout tree and determine whether
    // it can be collapsed based on whether it has any sibling
    // panes that aren't already collapsed.
    walkLayout(tab.layout, ({ node, parent }) => {
      if (node.type === "pane" && node.paneId === pane.id) {
        isPaneCollapsed = Boolean(node.collapsed);
        canPaneBeCollapsed =
          !!parent &&
          parent.children.length > 1 &&
          !parent.children.every(
            (child) =>
              child.id === node.id ||
              (child.type === "pane" && child.collapsed),
          );
        return false;
      }
    });
  }

  contextKeyService.setGlobal(paneIsCollapsed.key, isPaneCollapsed);
  contextKeyService.setGlobal(paneCanBeCollapsed.key, canPaneBeCollapsed);
};

/**
 * Register menu context builders for application menus
 *
 * This should be called during app initialization, after registering commands.
 */
export function registerMenuContextBuilders(): void {
  registerMenuContextBuilder(MenuId.TabContext, tabContextBuilder);
  registerMenuContextBuilder(MenuId.PaneContext, paneContextBuilder);
}
