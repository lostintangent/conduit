import { useCallback, useEffect, useRef, type RefObject } from "react";

const OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

const PRESSED_SELECTOR = 'button, [role="button"]';

/** How long to keep retrying while the pane's content is still hidden */
const SETTLE_MS = 500;

/** The active pane's way to take focus back, see `focusActivePane` */
const focusRequests = new Set<() => void>();

/**
 * Moves focus into a pane when it becomes the active pane, whether by a tab
 * switch, pane navigation or a click, so keystrokes go where the user is
 * looking. Every pane type follows this one rule.
 *
 * Focus is left alone when it's already inside the pane, or in a menu or
 * dialog that the pane isn't part of (e.g. a dropdown opened from the pane's
 * own toolbar while activating it).
 *
 * A pane's content can stay hidden for a few frames after activation (e.g. an
 * editor settling its layout after a tab switch), so it retries for a moment,
 * as long as focus stays where it was or is lost. `settled` tells the last
 * try that the pane is done settling.
 *
 * Focus goes back to where it last was in the pane while that's still
 * showing, like a half-typed prompt, and to the pane's own target otherwise.
 * The function it returns tells it focus moved to something the pane shows
 * outside its DOM, like a browser pane's page.
 *
 * The active pane also takes focus back when `focusActivePane` asks for it.
 */
export function useFocusWhenActive(
  isActive: boolean,
  paneRef: RefObject<HTMLElement | null>,
  focus: (settled: boolean) => void,
) {
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const lastFocusedRef = useRef<{
    element: HTMLElement;
    isOutside?: boolean;
  } | null>(null);

  useEffect(() => {
    const pane = paneRef.current;
    const remember = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      // Only some platforms leave focus on a button that was clicked, and it
      // isn't where the user was working
      if (!target.matches(PRESSED_SELECTOR)) {
        lastFocusedRef.current = { element: target };
      }
    };
    pane?.addEventListener("focusin", remember);
    return () => pane?.removeEventListener("focusin", remember);
  }, [paneRef]);

  useEffect(() => {
    if (!isActive) return;

    let frame = 0;
    let start = 0;
    // Where focus was on the first try. Retries go on only while it's still
    // there or lost, so they never take focus from where the user moved it.
    let from: Element | null | undefined;
    const tryFocus = () => {
      const pane = paneRef.current;
      if (!pane) return;
      const last = lastFocusedRef.current;
      const hasFocus = () =>
        pane.contains(document.activeElement) ||
        (!!last?.isOutside && document.activeElement === last.element);
      if (hasFocus()) return;
      const current = document.activeElement;
      if (from === undefined) from = current;
      else if (current !== from && !isFocusLost(current)) return;

      // A menu in a tab that was just hidden is closing, so its focus is lost
      const overlay = current?.closest(OVERLAY_SELECTOR);
      if (overlay && !overlay.contains(pane) && !isFocusLost(current)) return;

      const settled = performance.now() - start >= SETTLE_MS;
      if (
        last &&
        (last.isOutside || pane.contains(last.element)) &&
        last.element.checkVisibility()
      ) {
        last.element.focus({ preventScroll: true });
      }
      // Like when it's been disabled since
      if (document.activeElement !== last?.element) focusRef.current(settled);

      if (!settled && !hasFocus()) {
        frame = requestAnimationFrame(tryFocus);
      }
    };

    const focusFrom = (element?: Element | null) => {
      cancelAnimationFrame(frame);
      start = performance.now();
      from = element;
      frame = requestAnimationFrame(tryFocus);
    };

    focusFrom();
    // A request only takes focus that was lost
    const request = () => focusFrom(null);
    // Keeps the most recently focused pane last in line, see `focusActivePane`
    const moveToEnd = () => {
      focusRequests.delete(request);
      focusRequests.add(request);
    };
    moveToEnd();
    const pane = paneRef.current;
    pane?.addEventListener("focusin", moveToEnd);
    return () => {
      pane?.removeEventListener("focusin", moveToEnd);
      focusRequests.delete(request);
      cancelAnimationFrame(frame);
    };
  }, [isActive, paneRef]);

  return useCallback((element: HTMLElement) => {
    lastFocusedRef.current = { element, isOutside: true };
  }, []);
}

/**
 * Moves focus back into the active pane if it was lost, e.g. after a menu or
 * dialog that had it closes. Focus that went somewhere else stays there.
 *
 * A hyper terminal is active alongside the tab's pane, so the one that had
 * focus last takes it back, and the other takes it if that one can't.
 */
export function focusActivePane() {
  [...focusRequests].reverse().forEach((request) => request());
}

/** Focus is on the body, or on an element that was hidden (e.g. in a tab that was just switched away from) */
function isFocusLost(element: Element | null) {
  return !element || element === document.body || !element.checkVisibility();
}
