import { useEffect, useMemo, useState } from "react";
import type { AgentSessionInfo } from "@shared/types";

type AgentCleanupDialogProps = {
  isOpen: boolean;
  sessions: AgentSessionInfo[];
  onClose: () => void;
  onRemove: (sessionIds: string[]) => void | Promise<void>;
};

export function AgentCleanupDialog({
  isOpen,
  sessions,
  onClose,
  onRemove,
}: AgentCleanupDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set());
    }
  }, [isOpen, sessions]);

  const hasSelection = selectedIds.size > 0;

  const handleToggle = (sessionId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        if (a.createdAt === b.createdAt) {
          return a.branchName.localeCompare(b.branchName);
        }
        return b.createdAt - a.createdAt;
      }),
    [sessions]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/60 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="w-[520px] max-w-[94vw] rounded-xl border border-white/10 bg-surface-elevated p-5 text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Abandon agent sessions</h2>
        <p className="mt-1 text-sm text-white/70">
          Select one or more sessions to remove. Removing a session deletes its
          temporary worktree and branch without merging the changes.
        </p>

        <ul className="mt-4 max-h-64 overflow-y-auto divide-y divide-white/5 rounded-lg border border-white/10">
          {sortedSessions.map((session) => {
            const isSelected = selectedIds.has(session.id);
            return (
              <li
                key={session.id}
                className={`flex flex-col gap-1 px-3 py-3 transition hover:bg-white/5 ${
                  isSelected ? "bg-white/10" : ""
                }`}
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggle(session.id)}
                    className="mt-1 h-4 w-4 rounded border border-white/40 bg-transparent accent-sky-500"
                  />
                  <span className="flex-1">
                    <span className="text-sm font-medium">
                      {session.branchName}
                    </span>
                    <span className="ml-2 text-xs text-white/60">
                      {session.id.slice(0, 8)}
                    </span>
                    <span className="block text-xs text-white/60">
                      {session.worktreePath}
                    </span>
                    {session.baseBranch ? (
                      <span className="block text-xs text-white/60">
                        Base: {session.baseBranch}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onRemove(sortedSessions.map((session) => session.id))}
            className="rounded-md border border-white/20 px-3 py-2 text-sm font-medium text-white transition hover:border-white/40"
          >
            Remove all
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-white/20 px-3 py-2 text-sm font-medium text-white transition hover:border-white/40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!hasSelection}
              onClick={() => onRemove(Array.from(selectedIds))}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                hasSelection
                  ? "bg-red-500 text-white hover:bg-red-600"
                  : "bg-red-500/40 text-white/60"
              }`}
            >
              Remove selected
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
