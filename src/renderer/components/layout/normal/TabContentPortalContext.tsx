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

  mountTabInPreview: (tabId: string, element: HTMLElement) => void;
  unmountTabFromPreview: () => void;
};

const TabContentPortalContext =
  createContext<TabContentPortalContextValue | null>(null);

type OverlayMountPoint = { tabId: string; element: HTMLElement } | null;

export function TabContentPortalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [layoutMountPoints, setLayoutMountPoints] = useState<ContainerMap>({});
  const [previewMountPoint, setPreviewMountPoint] =
    useState<OverlayMountPoint>(null);

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

  const mountTabInPreview = useCallback(
    (tabId: string, element: HTMLElement) =>
      setPreviewMountPoint({ tabId, element }),
    []
  );

  const unmountTabFromPreview = useCallback(() => {
    setPreviewMountPoint(null);
  }, []);

  const getActiveMountPoint = useCallback(
    (tabId: string) => {
      if (previewMountPoint && previewMountPoint.tabId === tabId) {
        return previewMountPoint.element;
      }
      return layoutMountPoints[tabId];
    },
    [layoutMountPoints, previewMountPoint]
  );

  const value = useMemo<TabContentPortalContextValue>(
    () => ({
      setLayoutMountPoint,
      mountTabInPreview,
      unmountTabFromPreview,
      getActiveMountPoint,
    }),
    [
      getActiveMountPoint,
      mountTabInPreview,
      setLayoutMountPoint,
      unmountTabFromPreview,
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
