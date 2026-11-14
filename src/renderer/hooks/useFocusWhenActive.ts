import { useEffect, useRef, type RefObject } from "react";

const OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

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
 * The active pane also takes focus back when `focusActivePane` asks for it.
 */
export function useFocusWhenActive(
  isActive: boolean,
  paneRef: RefObject<HTMLElement | null>,
  focus: (settled: boolean) => void,
) {
  const focusRef = useRef(focus);
  focusRef.current = focus;

  useEffect(() => {
    if (!isActive) return;

    let frame = 0;
    let start = 0;
    // Where focus was on the first try. Retries go on only while it's still
    // there or lost, so they never take focus from where the user moved it.
    let from: Element | null | undefined;
    const tryFocus = () => {
      const pane = paneRef.current;
      const current = document.activeElement;
      if (!pane || pane.contains(current)) return;
      if (from === undefined) from = current;
      else if (current !== from && !isFocusLost(current)) return;

      const overlay = current?.closest(OVERLAY_SELECTOR);
      if (overlay && !overlay.contains(pane)) return;

      const settled = performance.now() - start >= SETTLE_MS;
      focusRef.current(settled);

      if (!settled && !pane.contains(document.activeElement)) {
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
