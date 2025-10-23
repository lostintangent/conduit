import { useEffect } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { TerminalPane } from "@/components/panes/TerminalPane";

type TerminalDialogProps = {
  sessionId: string;
  cwd: string | null;
  onClose: () => void;
  onOpenAsTab: () => void;
};

export function TerminalDialog({
  sessionId,
  cwd,
  onClose,
  onOpenAsTab,
}: TerminalDialogProps) {
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[90vh] h-[520px] min-h-[320px] max-w-[min(95vw,1000px)]! flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-surface">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs text-white/60">
          <span>{cwd}</span>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenAsTab}
              title="Open as tab"
              className="rounded-md p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <ArrowUpRight size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="rounded-md p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex flex-1 min-h-0 min-w-0">
          <TerminalPane sessionId={sessionId} isActive />
        </div>
      </div>
    </div>
  );
}
