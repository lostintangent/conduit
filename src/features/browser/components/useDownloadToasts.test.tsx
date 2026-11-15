import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { updateDownload, showItemInFolder } = vi.hoisted(() => {
  const listeners = new Set<(download: unknown) => void>();
  const showItemInFolder = vi.fn();
  (window as any).conduit = {
    ...(window as any).conduit,
    browser: {
      on: (event: string, listener: (download: unknown) => void) => {
        if (event !== "downloadUpdated") return () => {};
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    workbench: { ...(window as any).conduit?.workbench, showItemInFolder },
  };
  return {
    updateDownload: (download: object) => {
      act(() => {
        for (const listener of listeners) listener(download);
      });
    },
    showItemInFolder,
  };
});

import { useDownloadToasts } from "@features/browser/components/useDownloadToasts";
import { notificationsAtom } from "@features/workbench/client/atoms";
import { NotificationCenter } from "@features/workbench/components/NotificationCenter";

function Downloads() {
  useDownloadToasts();
  return <NotificationCenter />;
}

const report = {
  id: 1,
  name: "report 2.csv",
  path: "/Users/me/Downloads/report 2.csv",
};
const archive = {
  id: 2,
  name: "archive.zip",
  path: "/Users/me/Downloads/archive.zip",
};

const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("useDownloadToasts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    notificationsAtom.set([]);
    render(<Downloads />);
  });

  afterEach(() => {
    vi.useRealTimers();
    showItemInFolder.mockClear();
  });

  it("says when a quick download is done, with a way to find it", () => {
    updateDownload({ ...report, state: "progressing", progress: 0.5 });
    updateDownload({ ...report, state: "completed" });

    expect(screen.getByText("Downloaded report 2.csv")).toBeTruthy();
    expect(screen.getByText("In Downloads")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show in Finder" }));
    expect(showItemInFolder).toHaveBeenCalledWith(report.path);
    wait(5000);
    expect(screen.queryByText("Downloaded report 2.csv")).toBeNull();
  });

  it("shows a long download's progress after a second, then that it's done", () => {
    updateDownload({ ...report, state: "progressing", progress: 0.1 });
    wait(999);
    expect(screen.queryByText("Downloading report 2.csv…")).toBeNull();
    wait(1);
    expect(screen.getByText("Downloading report 2.csv…")).toBeTruthy();
    expect(screen.getByText("10%")).toBeTruthy();

    updateDownload({ ...report, state: "progressing", progress: 0.42 });
    wait(60_000);
    expect(screen.getByText("42%")).toBeTruthy();

    updateDownload({ ...report, state: "completed" });
    expect(screen.queryByText("Downloading report 2.csv…")).toBeNull();
    expect(screen.getAllByText("Downloaded report 2.csv")).toHaveLength(1);
    wait(5000);
    expect(screen.queryByText("Downloaded report 2.csv")).toBeNull();
  });

  it("shows no percent for a download of unknown size", () => {
    updateDownload({ ...report, state: "progressing" });
    wait(1000);

    expect(screen.getByText("Downloading report 2.csv…")).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("says when a download fails, in place of its progress", () => {
    updateDownload({ ...report, state: "progressing", progress: 0.1 });
    wait(1000);
    updateDownload({ ...report, state: "failed" });

    expect(screen.queryByText("Downloading report 2.csv…")).toBeNull();
    expect(screen.queryByText("10%")).toBeNull();
    expect(screen.getByText("Couldn't download report 2.csv")).toBeTruthy();
    wait(5000);
    expect(screen.queryByText("Couldn't download report 2.csv")).toBeNull();
  });

  it("says nothing about a cancelled download, and takes back its progress", () => {
    updateDownload({ ...report, state: "progressing", progress: 0.1 });
    updateDownload({ ...archive, state: "progressing", progress: 0.1 });
    updateDownload({ ...report, state: "cancelled" });
    wait(1000);
    expect(screen.queryByText(/report 2\.csv/)).toBeNull();
    expect(screen.getByText("Downloading archive.zip…")).toBeTruthy();

    updateDownload({ ...archive, state: "cancelled" });
    expect(screen.queryByText(/archive\.zip/)).toBeNull();
  });
});
