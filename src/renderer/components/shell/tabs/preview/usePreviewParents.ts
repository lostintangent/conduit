import { useTabContentPortal } from "@/components/layout/normal/TabContentPortalContext";
import { useCallback, useEffect, useRef } from "react";

export function usePreviewParents(isActive: boolean) {
  const { registerPreviewParents, clearPreviewParents } = useTabContentPortal();
  const parentsRef = useRef<Record<string, HTMLElement>>({});

  useEffect(() => {
    if (!isActive) {
      parentsRef.current = {};
      clearPreviewParents();
    }
  }, [isActive, clearPreviewParents]);

  return useCallback(
    (tabId: string, element: HTMLDivElement | null) => {
      if (element) {
        parentsRef.current = { ...parentsRef.current, [tabId]: element };
      } else if (parentsRef.current[tabId]) {
        const { [tabId]: _removed, ...rest } = parentsRef.current;
        parentsRef.current = rest;
      }

      if (!isActive) {
        return;
      }

      if (Object.keys(parentsRef.current).length > 0) {
        registerPreviewParents({ ...parentsRef.current });
      } else {
        clearPreviewParents();
      }
    },
    [isActive, registerPreviewParents, clearPreviewParents]
  );
}

