import type { getOrCreate } from "@/store/terminals";
import type { Dispatch, SetStateAction } from "react";

const api = window.conduit;

type TerminalEntry = ReturnType<typeof getOrCreate>;

export type FitController = {
  initialize: (options: { markReady: () => void; onReady?: () => void }) => void;
  schedule: (options?: { immediateResize?: boolean }) => void;
  dispose: () => void;
};

export const createFitController = ({
  sessionId,
  container,
  entry,
  setDimensions,
}: {
  sessionId: string;
  container: HTMLDivElement;
  entry: TerminalEntry;
  setDimensions: Dispatch<SetStateAction<{ width: number; height: number } | null>>;
}): FitController => {
  let lastSize = { width: 0, height: 0 };
  let rafId: number | null = null;
  let resizeDebounceTimeout: NodeJS.Timeout | null = null;
  let hideOverlayTimeout: NodeJS.Timeout | null = null;
  let awaitingStableSize = true;
  let firstFitComplete = false;
  let initialized = false;
  const firstFitResolvers = new Set<() => void>();

  const clearOverlayTimeout = () => {
    if (hideOverlayTimeout) {
      clearTimeout(hideOverlayTimeout);
      hideOverlayTimeout = null;
    }
  };

  const showDimensionsOverlay = (width: number, height: number) => {
    setDimensions({ width, height });
    clearOverlayTimeout();
    hideOverlayTimeout = setTimeout(() => {
      setDimensions(null);
      hideOverlayTimeout = null;
    }, 800);
  };

  const resolveFirstFit = () => {
    if (firstFitComplete) {
      return;
    }

    firstFitComplete = true;
    firstFitResolvers.forEach((resolve) => resolve());
    firstFitResolvers.clear();
  };

  const waitForFirstFit = () =>
    firstFitComplete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
        firstFitResolvers.add(resolve);
      });

  const initialize = ({
    markReady,
    onReady,
  }: {
    markReady: () => void;
    onReady?: () => void;
  }) => {
    if (initialized) {
      return;
    }

    initialized = true;
    awaitingStableSize = true;
    firstFitComplete = false;
    lastSize = { width: 0, height: 0 };

    requestAnimationFrame(() => {
      schedule({ immediateResize: true });
      void waitForFirstFit().then(() => {
        markReady();
        requestAnimationFrame(() => {
          schedule();
          onReady?.();
        });
      });
    });
  };

  const schedule = (options?: { immediateResize?: boolean }) => {
    const fitAddon = entry.fit;
    const terminal = entry.terminal;

    if (!fitAddon || !terminal) {
      return;
    }

    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }

    const performResize = () => api.resize(sessionId, terminal.cols, terminal.rows);

    const run = () => {
      rafId = null;

      const element = terminal.element as HTMLElement | null;
      if (element) {
        // Clear inline widths that xterm sets while repositioning the textarea; otherwise
        // the container can report a stale width and `fit()` mis-measures on the first frame.
        element.style.width = "";
        const viewport = element.querySelector(
          ".xterm-viewport"
        ) as HTMLElement | null;
        const textarea = element.querySelector(
          "textarea"
        ) as HTMLTextAreaElement | null;

        if (viewport) {
          viewport.style.width = "";
        }
        if (textarea) {
          textarea.style.width = "";
        }
      }

      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) {
        return;
      }

      const sizeChanged = width !== lastSize.width || height !== lastSize.height;
      lastSize = { width, height };

      fitAddon.fit();

      const immediateResize =
        options?.immediateResize === true || awaitingStableSize;

      if (resizeDebounceTimeout !== null) {
        clearTimeout(resizeDebounceTimeout);
        resizeDebounceTimeout = null;
      }

      if (immediateResize) {
        performResize();
      } else {
        resizeDebounceTimeout = setTimeout(() => {
          performResize();
          resizeDebounceTimeout = null;
        }, 100);
      }

      if (sizeChanged) {
        showDimensionsOverlay(width, height);
      }

      if (awaitingStableSize) {
        if (!sizeChanged) {
          awaitingStableSize = false;
          resolveFirstFit();
        } else {
          rafId = requestAnimationFrame(() =>
            schedule({ immediateResize: true })
          );
        }
      } else {
        resolveFirstFit();
      }
    };

    rafId = requestAnimationFrame(run);
  };

  const dispose = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    if (resizeDebounceTimeout) {
      clearTimeout(resizeDebounceTimeout);
      resizeDebounceTimeout = null;
    }

    clearOverlayTimeout();
    setDimensions(null);

    firstFitResolvers.clear();
    awaitingStableSize = true;
    firstFitComplete = false;
    lastSize = { width: 0, height: 0 };
    initialized = false;
  };

  return {
    initialize,
    schedule,
    dispose,
  };
};
