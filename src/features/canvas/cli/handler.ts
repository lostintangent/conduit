import {
  sidebarPaneIds,
  sidebarStateAtom,
} from "@features/workbench/client/sidebarStore";
import type { HandlerContext, HandlerMap } from "@/cli/handlers/types";

const api = window.conduit;

/**
 * Convert an HTML canvas element to a Uint8Array PNG buffer.
 */
function canvasToBuffer(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("Failed to capture canvas"));
        return;
      }
      const buffer = new Uint8Array(await blob.arrayBuffer());
      resolve(buffer);
    }, "image/png");
  });
}

/**
 * Resolve a canvas pane: the one asked for, else the sidebar's canvas when
 * the sidebar shows it, else the first canvas in the calling terminal's tab.
 */
function resolveCanvasPane(
  context: HandlerContext,
  paneId?: string,
): { paneId: string; canvas: HTMLCanvasElement } {
  const findCanvasPane = () => {
    // First, check if sidebar is open with canvas view
    const sidebar = sidebarStateAtom.get();
    if (sidebar.isOpen && sidebar.view === "canvas") {
      // Try global canvas first (if sidebar is locked, this is the active one)
      const globalId = sidebarPaneIds.canvas.global();
      const globalCanvas = document.getElementById(`canvas-${globalId}`);
      if (globalCanvas) {
        return globalId;
      }

      // Fall back to per-CWD canvas (unlocked mode)
      return sidebarPaneIds.canvas.forCwd(context.activeCwd);
    }

    // Fall back to checking for a canvas pane in the tab
    const matchingTab = context.findCallingTerminalTab();

    const canvasPane = Object.entries(matchingTab.panes).find(
      ([, pane]) => pane.type === "canvas",
    );

    if (!canvasPane) {
      throw new Error("No canvas pane found in the calling tab or sidebar.");
    }

    return canvasPane[0];
  };

  const resolvedPaneId = paneId ?? findCanvasPane();

  const canvas = document.getElementById(
    `canvas-${resolvedPaneId}`,
  ) as HTMLCanvasElement | null;

  if (!canvas) {
    throw new Error(`Canvas pane ${resolvedPaneId} not found.`);
  }

  return { paneId: resolvedPaneId, canvas };
}

export default {
  "canvas-capture": async ({ paneId }, context) => {
    const { canvas } = resolveCanvasPane(context, paneId);

    // Export the canvas to a temporary PNG file
    const buffer = await canvasToBuffer(canvas);
    const filePath = await api.files.writeTempFile(buffer, "png");

    return filePath;
  },
} satisfies Partial<HandlerMap>;
