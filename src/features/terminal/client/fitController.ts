import type { Dispatch, SetStateAction } from "react";
import type { getOrCreate } from "./xtermCache";

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
  // Store the last known terminal size to detect changes
  let lastTerminalSize = {
    cols: entry.terminal.cols,
    rows: entry.terminal.rows,
  };

  // The first fit always sizes the PTY, because a shell that waits for its
  // size starts then, and a restored one starts at its saved size instead of
  // the 80x24 that a new xterm assumes.
  let hasFit = false;

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

    if (container.clientWidth === 0 || container.clientHeight === 0) return;

    fitAddon.fit();

    const cols = terminal.cols;
    const rows = terminal.rows;
    const terminalSizeChanged =
      cols !== lastTerminalSize.cols || rows !== lastTerminalSize.rows;

    if (terminalSizeChanged || !hasFit) {
      entry.resize(cols, rows);
    }
    if (terminalSizeChanged) {
      lastTerminalSize = { cols, rows };
      showDimensionsOverlay(cols, rows);
    }
    hasFit = true;
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
  }

  // Observe container size changes
  resizeObserver = new ResizeObserver(scheduleFit);
  resizeObserver.observe(container);

  // Schedule the initial fit on mount
  scheduleFit();

  return { dispose };
}
