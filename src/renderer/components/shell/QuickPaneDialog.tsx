import { EditorPane } from "@/components/panes/editor/EditorPane";
import { TerminalPane } from "@/components/panes/terminal/TerminalPane";
import { WebPane } from "@/components/panes/web/WebPane";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Pane } from "@/types";
import { generateId } from "@/utils/id";
import type { FileTreeNode } from "@shared/types";
import { ArrowUpRight, X } from "lucide-react";
import { useCallback, useState } from "react";

export type PaneDescriptor = Omit<Pane, "id">;

type QuickPaneDialogProps = {
  paneDescriptor: PaneDescriptor;
  onClose: () => void;
  onOpenAsTab: (descriptor: PaneDescriptor) => void;
};

export function QuickPaneDialog({
  paneDescriptor,
  onClose,
  onOpenAsTab,
}: QuickPaneDialogProps) {
  const [currentDescriptor, setCurrentDescriptor] =
    useState<PaneDescriptor>(paneDescriptor);

  // Generate a stable paneId for the quick pane
  const [quickPaneId] = useState(() => generateId());

  // Handle updates from editor pane
  const handleEditorUpdate = useCallback(
    (updates: { cwd?: string; filePath?: string }) => {
      if (currentDescriptor.type === "editor") {
        setCurrentDescriptor((prev) => ({
          ...prev,
          ...updates,
        }));
      }
    },
    [currentDescriptor.type]
  );

  // Handle updates from webview pane
  const handleWebViewUpdate = useCallback(
    (updates: { url?: string; title?: string }) => {
      if (currentDescriptor.type === "webview") {
        setCurrentDescriptor((prev) => ({
          ...prev,
          ...updates,
        }));
      }
    },
    [currentDescriptor.type]
  );

  // Handle file open from within editor pane
  const handleFileOpen = useCallback(
    (node: FileTreeNode) => {
      setCurrentDescriptor((prev) => {
        if (prev.type === "editor") {
          // Update the descriptor to open the file in the same quick pane
          return {
            type: "editor",
            cwd: prev.cwd,
            filePath: node.path,
          };
        }
        return prev;
      });
    },
    []
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        showClose={false}
        className="flex max-w-[min(95vw,1000px)] h-[720px] min-h-[320px] max-h-[90vh] overflow-hidden p-0 bg-surface border-white/10"
      >
        <div className="flex flex-1 w-full h-full min-h-0 min-w-0 overflow-hidden">
          {currentDescriptor.type === "terminal" && (
            <TerminalPane sessionId={currentDescriptor.sessionId} isActive />
          )}
          {currentDescriptor.type === "editor" && (
            <EditorPane
              cwd={currentDescriptor.cwd}
              filePath={currentDescriptor.filePath}
              onCwdChange={(cwd) => handleEditorUpdate({ cwd })}
              onFileChange={({ filePath }) =>
                handleEditorUpdate({ filePath })
              }
              onClearFile={() => handleEditorUpdate({ filePath: undefined })}
              onFileOpen={handleFileOpen}
            />
          )}
          {currentDescriptor.type === "webview" && (
            <WebPane
              url={currentDescriptor.url}
              paneId={quickPaneId}
              onUrlChange={(url) => handleWebViewUpdate({ url })}
              onTitleChange={(title) => handleWebViewUpdate({ title })}
            />
          )}
        </div>

        <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-2 text-white">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/50 px-3 py-2 shadow-lg backdrop-blur">
            <button
              type="button"
              onClick={() => onOpenAsTab(currentDescriptor)}
              title="Open in tab"
              className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white"
            >
              <ArrowUpRight size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close quick pane"
              className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </div>

      </DialogContent>
    </Dialog >
  );
}
