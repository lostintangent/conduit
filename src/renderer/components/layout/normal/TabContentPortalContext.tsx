import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type ContainerMap = Record<string, HTMLElement>;

type TabContentPortalContextValue = {
  setLayoutMountPoint: (tabId: string, element: HTMLElement | null) => void;
  getActiveMountPoint: (tabId: string) => HTMLElement | null;

  mountTabsForPreview: (elements: Record<string, HTMLElement>) => void;
  unmountTabsFromPreview: () => void;
};

const TabContentPortalContext =
  createContext<TabContentPortalContextValue | null>(null);

export function TabContentPortalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [layoutMountPoints, setLayoutMountPoints] = useState<ContainerMap>({});
  const [previewMountPoints, setPreviewMountPoints] = useState<ContainerMap>({});

  const setLayoutMountPoint = useCallback(
    (tabId: string, element: HTMLElement | null) => {
      setLayoutMountPoints((previous) => {
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

  const mountTabsForPreview = useCallback(
    (elements: Record<string, HTMLElement>) => {
      setPreviewMountPoints(elements);
    },
    []
  );

  const unmountTabsFromPreview = useCallback(() => {
    setPreviewMountPoints({});
  }, []);

  const getActiveMountPoint = useCallback(
    (tabId: string) => {
      if (previewMountPoints[tabId]) {
        return previewMountPoints[tabId];
      }
      return layoutMountPoints[tabId];
    },
    [layoutMountPoints, previewMountPoints]
  );

  const value = useMemo<TabContentPortalContextValue>(
    () => ({
      setLayoutMountPoint,
      mountTabsForPreview,
      unmountTabsFromPreview,
      getActiveMountPoint,
    }),
    [
      getActiveMountPoint,
      mountTabsForPreview,
      setLayoutMountPoint,
      unmountTabsFromPreview,
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
