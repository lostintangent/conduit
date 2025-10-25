import { TerminalPane } from "@/components/panes/TerminalPane";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ArrowUpRight } from "lucide-react";

type QuickTerminalProps = {
  sessionId: string;
  cwd: string | null;
  onClose: () => void;
  onOpenAsTab: () => void;
};

export function QuickTerminal({
  sessionId,
  cwd,
  onClose,
  onOpenAsTab,
}: QuickTerminalProps) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-[min(95vw,1000px)] h-[520px] min-h-[320px] max-h-[90vh] p-0 gap-0 bg-surface border-white/10">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs text-white/60">
          <span>{cwd}</span>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenAsTab}
              title="Open as tab"
              className="rounded-md p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white mr-6 mt-0.5"
            >
              <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
        <div className="flex flex-1 min-h-0 min-w-0">
          <TerminalPane sessionId={sessionId} isActive />
        </div>
      </DialogContent>
    </Dialog>
  );
}
