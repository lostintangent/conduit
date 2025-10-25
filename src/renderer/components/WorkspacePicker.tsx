import { openWorkspace } from "@/store/actions/workspace";
import type { Workspace } from "@shared/types";
import { useCallback, useEffect, useRef, useState } from "react";

type WorkspacePickerDialog = {
  isOpen: boolean;
  onClose: () => void;
  sessions: Workspace[];
  onSessionsUpdate: (sessions: Workspace[]) => void;
};

export function WorkspacePicker({
  isOpen,
  onClose,
  sessions,
  onSessionsUpdate,
}: WorkspacePickerDialog) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSelectedIndex(0);

    const focusHandle = requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    return () => cancelAnimationFrame(focusHandle);
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (key === "escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (key === "enter") {
        event.preventDefault();
        const session = sessions[selectedIndex];
        if (session) {
          void (async () => {
            await openWorkspace(session);
            onClose();
          })();
        }
        return;
      }

      if (key === "arrowdown") {
        event.preventDefault();
        setSelectedIndex((current) =>
          current >= sessions.length - 1 ? 0 : current + 1
        );
        return;
      }

      if (key === "arrowup") {
        event.preventDefault();
        setSelectedIndex((current) =>
          current <= 0 ? sessions.length - 1 : current - 1
        );
      }

      if (key === "delete" || key === "backspace") {
        event.preventDefault();
        const session = sessions[selectedIndex];
        if (session) {
          void (async () => {
            const api = window.conduit;
            if (!api) {
              return;
            }

            await api.deleteSession(session.timestamp);
            const updatedSessions =
              (await api.loadSessions()) as Workspace[];
            onSessionsUpdate(updatedSessions);

            if (updatedSessions.length === 0) {
              onClose();
            } else {
              setSelectedIndex((current) =>
                Math.min(current, updatedSessions.length - 1)
              );
            }
          })();
        }
      }
    },
    [onClose, selectedIndex, sessions, onSessionsUpdate]
  );

  const handleRestoreSession = useCallback(
    (session: Workspace) => {
      void (async () => {
        await openWorkspace(session);
        onClose();
      })();
    },
    [onClose]
  );

  const handleDeleteSession = useCallback(
    async (session: Workspace, event: React.MouseEvent) => {
      event.stopPropagation();

      const api = window.conduit;
      if (!api) {
        return;
      }

      await api.deleteSession(session.timestamp);
      const updatedSessions = (await api.loadSessions()) as Workspace[];
      onSessionsUpdate(updatedSessions);

      if (updatedSessions.length === 0) {
        onClose();
      } else {
        setSelectedIndex((current) =>
          Math.min(current, updatedSessions.length - 1)
        );
      }
    },
    [onClose, onSessionsUpdate]
  );

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return "Just now";
    } else if (diffMins < 60) {
      return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      });
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="w-[480px] max-w-[90vw] rounded-xl border border-white/10 bg-surface-elevated p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <h2 className="mb-3 text-lg font-semibold text-white">
          Restore Saved Workspace
        </h2>

        {sessions.length === 0 ? (
          <p className="rounded-md border border-dashed border-white/10 bg-white/5 px-3 py-2 text-sm text-white/50">
            No saved workspaces available.
          </p>
        ) : (
          <ul
            className="max-h-[400px] space-y-2 overflow-y-auto"
            role="listbox"
          >
            {sessions.map((session, index) => {
              const isActive = index === selectedIndex;
              const tabCount = session.tabs.length;

              return (
                <li key={session.timestamp}>
                  <div
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`flex w-full items-center rounded-md border transition ${isActive
                      ? "border-white/30 bg-white/10 text-white"
                      : "border-transparent text-white/80 hover:border-white/20 hover:bg-white/5"
                      }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleRestoreSession(session)}
                      className="flex flex-1 flex-col gap-1 px-3 py-2 text-left focus:outline-none"
                    >
                      <span className="text-sm font-medium">
                        {session.name}
                      </span>
                      <span className="text-xs text-white/50">
                        {tabCount} tab{tabCount === 1 ? "" : "s"} •{" "}
                        {formatTimestamp(session.timestamp)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSession(session, e)}
                      aria-label="Delete session"
                      className="mr-2 rounded-md p-1 text-sm leading-none text-current transition hover:bg-black/20 focus:outline-none focus:ring-2 focus:ring-white/30"
                    >
                      ×
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-3 text-xs text-white/50">
          Press Enter to restore, Delete to remove, Esc to cancel
        </p>
      </div>
    </div>
  );
}
