import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFitController } from "./fitController";

describe("createFitController", () => {
  let frames: FrameRequestCallback[];
  let observed: () => void;

  beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          observed = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setup(fitTo: { cols: number; rows: number }) {
    const terminal = { cols: 80, rows: 24 };
    const entry = {
      terminal,
      fit: { fit: () => Object.assign(terminal, fitTo) },
      resize: vi.fn(),
    };
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 500 });
    Object.defineProperty(container, "clientHeight", { value: 300 });
    const setDimensions = vi.fn();
    const controller = createFitController({
      entry: entry as any,
      container,
      setDimensions,
    });
    const fit = () => frames.splice(0).forEach((frame) => frame(0));
    return { entry, controller, fit, setDimensions };
  }

  // A shell can start at a measured size, so the PTY needs the fitted size
  // even when it matches the 80x24 that a new xterm starts at.
  it("sizes the PTY on the first fit even when xterm's size doesn't change", () => {
    const { entry, controller, fit } = setup({ cols: 80, rows: 24 });

    fit();
    expect(entry.resize).toHaveBeenCalledWith(80, 24);

    observed();
    fit();
    expect(entry.resize).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("shows the size when the terminal resizes, not when it first fits", () => {
    const fitTo = { cols: 127, rows: 45 };
    const { controller, fit, setDimensions } = setup(fitTo);

    fit();
    expect(setDimensions).not.toHaveBeenCalled();

    Object.assign(fitTo, { cols: 100 });
    observed();
    fit();
    expect(setDimensions).toHaveBeenCalledWith({ width: 100, height: 45 });
    controller.dispose();
  });
});
