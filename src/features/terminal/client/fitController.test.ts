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
    const controller = createFitController({
      entry: entry as any,
      container,
      setDimensions: vi.fn(),
    });
    const fit = () => frames.splice(0).forEach((frame) => frame(0));
    return { entry, controller, fit };
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
});
