import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AgentSessionInfo } from "@shared/types";
import { useEffect, useMemo, useState } from "react";

type AgentCleanupDialogProps = {
  isOpen: boolean;
  sessions: AgentSessionInfo[];
  onClose: () => void;
  onRemove: (sessionIds: string[]) => void | Promise<void>;
  onOpen?: (session: AgentSessionInfo) => void | Promise<void>;
};

export function AgentCleanupDialog({
  isOpen,
  sessions,
  onClose,
  onRemove,
  onOpen,
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
    [sessions],
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[520px] max-w-[94vw] p-5 gap-0">
        <DialogHeader className="space-y-1">
          <DialogTitle>Manage agent sessions</DialogTitle>
          <DialogDescription>
            Select one or more sessions to remove. Removing a session deletes
            its temporary worktree and branch without merging the changes.
          </DialogDescription>
        </DialogHeader>

        <ul className="mt-4 max-h-64 overflow-y-auto divide-y divide-white/5 rounded-lg border border-white/10">
          {sortedSessions.map((session) => {
            const isSelected = selectedIds.has(session.id);
            return (
              <li
                key={session.id}
                className={`flex items-center gap-3 px-3 py-3 transition hover:bg-white/5 ${
                  isSelected ? "bg-white/10" : ""
                }`}
              >
                <label className="flex flex-1 cursor-pointer items-start gap-3">
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
                {onOpen && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpen(session);
                      onClose();
                    }}
                    className="shrink-0 rounded-md border border-white/20 px-3 py-2 text-xs font-medium text-white transition hover:border-white/40 hover:bg-white/5"
                  >
                    Open
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() =>
              onRemove(sortedSessions.map((session) => session.id))
            }
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
      </DialogContent>
    </Dialog>
  );
}
