import type { getOrCreate } from "./xtermCache";
import type { Dispatch, SetStateAction } from "react";

/**
 * Creates a FitController that automatically fits and resizes the terminal
 * within the given container element. It observes size changes and updates
 * the terminal dimensions accordingly, while also providing a temporary
 * overlay to show the current dimensions.
 */
export function createFitController({
  entry,
  container,
  setDimensions,
}: {
  entry: ReturnType<typeof getOrCreate>;
  container: HTMLDivElement;
  setDimensions: Dispatch<
    SetStateAction<{ width: number; height: number } | null>
  >;
}): { dispose: () => void } {
  // Store the last known sizes to detect changes
  let lastContainerSize = { width: 0, height: 0 };
  let lastTerminalSize = {
    cols: entry.terminal.cols,
    rows: entry.terminal.rows,
  };

  // Animation frame and timeout IDs
  let fitTimeout: number | null = null;
  let overlayTimeout: NodeJS.Timeout | null = null;
  let resizeObserver: ResizeObserver | null = null;

  function clearOverlayTimeout() {
    if (overlayTimeout) {
      clearTimeout(overlayTimeout);
      overlayTimeout = null;
    }
  }

  function showDimensionsOverlay(width: number, height: number) {
    setDimensions({ width, height });
    clearOverlayTimeout();

    overlayTimeout = setTimeout(() => {
      setDimensions(null);
      overlayTimeout = null;
    }, 800);
  }

  function fitAndResize() {
    const fitAddon = entry.fit;
    const terminal = entry.terminal;

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    const sizeChanged =
      width !== lastContainerSize.width || height !== lastContainerSize.height;
    if (sizeChanged) {
      lastContainerSize = { width, height };
      showDimensionsOverlay(width, height);
    }

    fitAddon.fit();

    const cols = terminal.cols;
    const rows = terminal.rows;
    const terminalSizeChanged =
      cols !== lastTerminalSize.cols || rows !== lastTerminalSize.rows;

    if (terminalSizeChanged) {
      lastTerminalSize = { cols, rows };
      entry.resize(cols, rows);
    }

    if (!entry.ready) {
      entry.markReady();
    }
  }

  function scheduleFit() {
    if (fitTimeout !== null) {
      cancelAnimationFrame(fitTimeout);
    }

    fitTimeout = requestAnimationFrame(() => {
      fitTimeout = null;
      fitAndResize();
    });
  }

  function dispose() {
    if (fitTimeout !== null) {
      cancelAnimationFrame(fitTimeout);
      fitTimeout = null;
    }

    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }

    clearOverlayTimeout();
    setDimensions(null);

    lastContainerSize = { width: 0, height: 0 };
    lastTerminalSize = { cols: entry.terminal.cols, rows: entry.terminal.rows };
  }

  // Observe container size changes
  resizeObserver = new ResizeObserver(scheduleFit);
  resizeObserver.observe(container);

  // Schedule the initial fit on mount
  scheduleFit();

  return { dispose };
}
