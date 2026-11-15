import type { Download } from "@features/browser/model";
import {
  dismissNotification,
  enqueueNotification,
  updateNotification,
} from "@features/workbench/client/actions/notifications";
import type { Notification } from "@features/workbench/model";
import { useEffect } from "react";

const { browser, workbench } = window.conduit;

// A quick download only says it's done. One that takes longer shows how it's
// going, so it doesn't look like nothing happened.
const PROGRESS_DELAY_MS = 1000;
const DONE_MS = 5000;

type Toast = Pick<Notification, "kind" | "message" | "details" | "actions">;

function progressToast({ name, progress }: Download): Toast {
  return {
    kind: "info",
    message: `Downloading ${name}…`,
    details:
      progress === undefined ? undefined : `${Math.floor(progress * 100)}%`,
    actions: undefined,
  };
}

function doneToast(download: Download): Toast {
  return download.state === "completed"
    ? {
        kind: "success",
        message: `Downloaded ${download.name}`,
        details: "In Downloads",
        actions: [
          {
            label: "Show in Finder",
            onClick: () => workbench.showItemInFolder(download.path),
          },
        ],
      }
    : {
        kind: "error",
        message: `Couldn't download ${download.name}`,
        details: undefined,
        actions: undefined,
      };
}

/**
 * Toasts for pages' downloads: how a long one is going, then that it's done
 * or failed. A cancelled one says nothing.
 */
export function useDownloadToasts() {
  useEffect(() => {
    const arriving = new Map<
      number,
      {
        latest: Download;
        timer: ReturnType<typeof setTimeout>;
        toastId?: string;
      }
    >();

    const unsubscribe = browser.on("downloadUpdated", (download) => {
      const shown = arriving.get(download.id);
      if (download.state === "progressing") {
        if (!shown) {
          const entry = {
            latest: download,
            toastId: undefined as string | undefined,
            timer: setTimeout(() => {
              entry.toastId = enqueueNotification({
                ...progressToast(entry.latest),
                persistent: true,
              });
            }, PROGRESS_DELAY_MS),
          };
          arriving.set(download.id, entry);
        } else {
          shown.latest = download;
          if (shown.toastId) {
            updateNotification(shown.toastId, progressToast(download));
          }
        }
        return;
      }

      arriving.delete(download.id);
      clearTimeout(shown?.timer);
      if (download.state === "cancelled") {
        if (shown?.toastId) dismissNotification(shown.toastId);
      } else if (shown?.toastId) {
        updateNotification(shown.toastId, {
          ...doneToast(download),
          autoCloseMs: DONE_MS,
        });
      } else {
        enqueueNotification({ ...doneToast(download), autoCloseMs: DONE_MS });
      }
    });

    return () => {
      unsubscribe();
      for (const { timer } of arriving.values()) clearTimeout(timer);
    };
  }, []);
}
