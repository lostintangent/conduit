/**
 * useSidebarNavigation - Hook for consuming one-shot navigation requests
 *
 * Each sidebar view (editor, browser, canvas) can receive navigation requests
 * via the sidebarStateAtom. This hook provides a clean interface for consuming
 * those requests with automatic cleanup.
 *
 * The navigation is "one-shot": once consumed, it's cleared from the atom
 * to prevent re-triggering on subsequent renders.
 */

import { sidebarStateAtom, type SidebarNavigation } from "@/store/sidebarStore";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";

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
 *
 * @example
 * // In BrowserView - single field (prefer useSidebarNavigationField):
 * useSidebarNavigationField("browserUrl", (url) => {
 *   setCwdBrowserUrl(cwd, url);
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

/**
 * Simplified hook for single-field navigation consumption.
 *
 * @param field - The navigation field to watch
 * @param handler - Callback when the field is present
 *
 * @example
 * useSidebarNavigationField("browserUrl", setUrl);
 */
export function useSidebarNavigationField<K extends keyof SidebarNavigation>(
  field: K,
  handler: (value: NonNullable<SidebarNavigation[K]>) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useSidebarNavigation(
    useCallback(
      (nav) => {
        const value = nav[field];
        if (value !== undefined) {
          handlerRef.current(value as NonNullable<SidebarNavigation[K]>);
          return true;
        }
        return undefined;
      },
      [field],
    ),
  );
}
