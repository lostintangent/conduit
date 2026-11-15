/**
 * useSidebarNavigation - Hook for consuming one-shot navigation requests
 *
 * The sidebar's editor view receives navigation requests via the
 * sidebarStateAtom. This hook provides a clean interface for consuming
 * those requests with automatic cleanup.
 *
 * The navigation is "one-shot": once consumed, it's cleared from the atom
 * to prevent re-triggering on subsequent renders.
 */

import {
  sidebarStateAtom,
  type SidebarNavigation,
} from "@features/workbench/client/sidebarStore";
import { useAtom } from "@tanstack/react-store";
import { useEffect, useRef } from "react";

type NavigationConsumer = (
  navigation: SidebarNavigation,
) => boolean | undefined;

/**
 * Hook for consuming sidebar navigation requests.
 *
 * @param consumer - Function that extracts and handles relevant navigation fields.
 *                   Should return undefined if no relevant fields are present,
 *                   or true if fields were consumed (triggers cleanup).
 *                   The consumer is stored in a ref, so it always has access to
 *                   fresh values without needing explicit dependencies.
 *
 * @example
 * // In EditorView - handle multiple fields:
 * useSidebarNavigation((nav) => {
 *   if (!nav.editorTreeMode && !nav.editorFile) return;
 *   if (nav.editorTreeMode) setTreeMode(nav.editorTreeMode);
 *   if (nav.editorFile) setCwdEditorFile(cwd, nav.editorFile);
 *   return true; // Signal that we consumed something
 * });
 */
export function useSidebarNavigation(consumer: NavigationConsumer): void {
  const [sidebarState, setSidebarState] = useAtom(sidebarStateAtom);
  const navigation = sidebarState.navigation;

  // Track the consumer in a ref to avoid stale closures while keeping effect stable
  const consumerRef = useRef(consumer);
  consumerRef.current = consumer;

  useEffect(() => {
    if (!navigation) return;

    const result = consumerRef.current(navigation);

    // If consumer returned something truthy, clear the navigation
    if (result !== undefined) {
      setSidebarState((prev) => ({ ...prev, navigation: undefined }));
    }
  }, [navigation, setSidebarState]);
}
