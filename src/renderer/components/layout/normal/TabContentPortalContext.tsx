import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

/**
 * Where a tab's content is: the element it renders into for as long as the
 * tab exists, the tab's panel, and the preview showing it, if any.
 */
type TabContent = {
  host?: HTMLElement;
  panel?: HTMLElement;
  preview?: HTMLElement;
};

type TabContentPortalContextValue = {
  /**
   * Puts the tab's content host in its panel, or in its preview while it has
   * one, until the returned cleanup runs.
   */
  attachPanel: (
    tabId: string,
    panel: HTMLElement,
    host: HTMLElement,
  ) => () => void;

  /** Shows the tab's content in `container` until the returned cleanup runs */
  previewTab: (tabId: string, container: HTMLElement) => () => void;

  isTabInPreview: (tabId: string) => boolean;
};

const TabContentPortalContext =
  createContext<TabContentPortalContextValue | null>(null);

/**
 * Moves a tab's content between its panel and a preview, by moving the one
 * element it renders into, so a preview never remounts the tab's panes.
 */
export function TabContentPortalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [contents] = useState(() => new Map<string, TabContent>());
  const [previewTabIds, setPreviewTabIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const update = useCallback(
    (tabId: string, changes: TabContent) => {
      const content = { ...contents.get(tabId), ...changes };
      if (!content.panel && !content.preview) {
        contents.delete(tabId);
        return;
      }

      contents.set(tabId, content);
      const parent = content.preview ?? content.panel;
      if (content.host && parent && content.host.parentNode !== parent) {
        moveInto(parent, content.host);
      }
    },
    [contents],
  );

  const attachPanel = useCallback(
    (tabId: string, panel: HTMLElement, host: HTMLElement) => {
      update(tabId, { panel, host });
      return () => update(tabId, { panel: undefined, host: undefined });
    },
    [update],
  );

  const previewTab = useCallback(
    (tabId: string, container: HTMLElement) => {
      update(tabId, { preview: container });
      setPreviewTabIds((ids) => new Set(ids).add(tabId));

      return () => {
        // Moves the content back before the preview leaves the page, which
        // would reset scroll positions inside it
        if (contents.get(tabId)?.preview === container) {
          update(tabId, { preview: undefined });
        }
        setPreviewTabIds((ids) => {
          const next = new Set(ids);
          next.delete(tabId);
          return next;
        });
      };
    },
    [contents, update],
  );

  const isTabInPreview = useCallback(
    (tabId: string) => previewTabIds.has(tabId),
    [previewTabIds],
  );

  const value = useMemo<TabContentPortalContextValue>(
    () => ({ attachPanel, previewTab, isTabInPreview }),
    [attachPanel, previewTab, isTabInPreview],
  );

  return (
    <TabContentPortalContext.Provider value={value}>
      {children}
    </TabContentPortalContext.Provider>
  );
}

/**
 * Moves `node` to the end of `parent`, keeping scroll positions inside it,
 * which removing and re-adding it would reset.
 */
function moveInto(parent: HTMLElement, node: HTMLElement) {
  if (parent.isConnected && node.isConnected && "moveBefore" in parent) {
    parent.moveBefore(node, null);
  } else {
    parent.append(node);
  }
}

export const useTabContentPortal = () => {
  const context = useContext(TabContentPortalContext);
  if (!context) {
    throw new Error(
      "useTabContentPortal must be used within a TabContentPortalProvider",
    );
  }
  return context;
};
