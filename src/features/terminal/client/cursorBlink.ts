import type { ITerminalAddon } from "@xterm/xterm";

const HIDDEN_CLASS = "xterm-cursor-blink-hidden";
const HALF_BLINK_MS = 500;

/**
 * xterm's DOM renderer blinks a focused cursor with an infinite CSS
 * animation, so the page recalculates its styles every frame while the
 * terminal sits idle. index.css pauses that animation, and this flips it
 * between its shown and hidden keyframes on a timer instead. The cursor looks
 * and blinks the same: shown for half a second, then hidden for half, counting
 * from each time xterm draws it.
 *
 * Load it once the terminal is open, since it watches the rendered rows.
 */
export function cursorBlink(): ITerminalAddon {
  let dispose = () => {};
  return {
    activate(terminal) {
      const root = terminal.element;
      const rows = root?.querySelector(".xterm-rows");
      if (!root || !rows) return;

      let timer: ReturnType<typeof setInterval> | undefined;
      // xterm only blinks a focused cursor, until it's idle for 5 minutes.
      const blinks = () =>
        rows.classList.contains("xterm-focus") &&
        !rows.classList.contains("xterm-cursor-blink-idle");
      const restart = () => {
        clearInterval(timer);
        root.classList.remove(HIDDEN_CLASS);
        timer = blinks()
          ? setInterval(
              () => root.classList.toggle(HIDDEN_CLASS),
              HALF_BLINK_MS,
            )
          : undefined;
      };

      const classes = new MutationObserver(() => {
        if (blinks() !== (timer !== undefined)) restart();
      });
      classes.observe(rows, { attributeFilter: ["class"] });
      // xterm's blink starts over each time it draws the cursor's row, since
      // that's a new cursor element with a new animation.
      const rendered = terminal.onRender(({ start, end }) => {
        const { baseY, cursorY, viewportY } = terminal.buffer.active;
        const row = baseY + cursorY - viewportY;
        if (timer !== undefined && row >= start && row <= end) restart();
      });
      restart();

      dispose = () => {
        classes.disconnect();
        rendered.dispose();
        clearInterval(timer);
        root.classList.remove(HIDDEN_CLASS);
      };
    },
    dispose() {
      dispose();
    },
  };
}
