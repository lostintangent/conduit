import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type ParentMap = Record<string, HTMLElement>;

type TabContentPortalContextValue = {
  setLayoutParent: (tabId: string, element: HTMLElement | null) => void;
  getActiveParent: (tabId: string) => HTMLElement | null;

  registerPreviewParents: (parents: Record<string, HTMLElement>) => void;
  clearPreviewParents: () => void;

  isTabInPreview: (tabId: string) => boolean;
};

const TabContentPortalContext =
  createContext<TabContentPortalContextValue | null>(null);

export function TabContentPortalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [layoutParents, setLayoutParents] = useState<ParentMap>({});
  const [previewParents, setPreviewParents] = useState<ParentMap>({});

  const setLayoutParent = useCallback(
    (tabId: string, element: HTMLElement | null) => {
      setLayoutParents((previous) => {
        if (element === null) {
          const next = { ...previous };
          delete next[tabId];
          return next;
        }

        const current = previous[tabId];
        if (current === element) {
          return previous;
        }

        return { ...previous, [tabId]: element };
      });
    },
    []
  );

  const registerPreviewParents = useCallback(
    (parents: Record<string, HTMLElement>) => {
      setPreviewParents(parents);
    },
    []
  );

  const clearPreviewParents = useCallback(() => {
    setPreviewParents({});
  }, []);

  const getActiveParent = useCallback(
    (tabId: string) => {
      if (previewParents[tabId]) {
        return previewParents[tabId];
      }
      return layoutParents[tabId];
    },
    [layoutParents, previewParents]
  );

  const isTabInPreview = useCallback(
    (tabId: string) => {
      return !!previewParents[tabId];
    },
    [previewParents]
  );

  const value = useMemo<TabContentPortalContextValue>(
    () => ({
      setLayoutParent,
      registerPreviewParents,
      clearPreviewParents,
      getActiveParent,
      isTabInPreview,
    }),
    [
      getActiveParent,
      registerPreviewParents,
      setLayoutParent,
      clearPreviewParents,
      isTabInPreview,
    ]
  );

  return (
    <TabContentPortalContext.Provider value={value}>
      {children}
    </TabContentPortalContext.Provider>
  );
}

export const useTabContentPortal = () => {
  const context = useContext(TabContentPortalContext);
  if (!context) {
    throw new Error(
      "useTabContentPortal must be used within a TabContentPortalProvider"
    );
  }
  return context;
};
