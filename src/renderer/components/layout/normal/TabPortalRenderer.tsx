import { useTabContentPortal } from "@/components/layout/normal/TabContentPortalContext";
import type React from "react";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

type TabPortalRendererProps = {
  tabId: string;
  children: React.ReactNode;
};

/**
 * Renders tab content into a stable DOM container that can be reparented
 * between the layout and preview hosts without unmounting the subtree.
 */
export function TabPortalRenderer({
  tabId,
  children,
}: TabPortalRendererProps) {
  const { getActiveParent } = useTabContentPortal();
  const portalContainerRef = useRef<HTMLDivElement | null>(null);

  if (!portalContainerRef.current) {
    const container = document.createElement("div");
    container.className =
      "flex flex-1 w-full h-full min-h-0 min-w-0 overflow-hidden";
    portalContainerRef.current = container;
  }

  const activeParent = getActiveParent(tabId);

  useLayoutEffect(() => {
    const portalContainer = portalContainerRef.current;
    if (!portalContainer) {
      return;
    }

    if (activeParent) {
      if (portalContainer.parentElement !== activeParent) {
        activeParent.appendChild(portalContainer);
      }
    } else if (portalContainer.parentElement) {
      portalContainer.parentElement.removeChild(portalContainer);
    }
  }, [activeParent]);

  useLayoutEffect(() => {
    const portalContainer = portalContainerRef.current;

    return () => {
      if (portalContainer?.parentElement) {
        portalContainer.parentElement.removeChild(portalContainer);
      }
    };
  }, []);

  // The portal keeps the pane subtree mounted while we reparent the
  // containing DOM node between layout and preview hosts.
  return portalContainerRef.current
    ? createPortal(children, portalContainerRef.current)
    : null;
}

