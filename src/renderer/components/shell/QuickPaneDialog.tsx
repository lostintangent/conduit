import { EditorPane } from "@/components/panes/editor/EditorPane";
import { TerminalPane } from "@/components/panes/terminal/TerminalPane";
import { WebPane } from "@/components/panes/web/WebPane";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ArrowUpRight } from "lucide-react";
import { useCallback, useState } from "react";
import { generateId } from "@/utils/id";

export type PaneDescriptor =
  | {
      type: "terminal";
      sessionId: string;
      cwd: string | null;
    }
  | {
      type: "editor";
      cwd: string;
      filePath?: string;
    }
  | {
      type: "webview";
      url: string;
      title?: string;
    };

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

  const handleOpenAsTab = useCallback(() => {
    onOpenAsTab(currentDescriptor);
  }, [currentDescriptor, onOpenAsTab]);

  // Get display label for header
  const getDisplayLabel = () => {
    switch (currentDescriptor.type) {
      case "terminal":
        return currentDescriptor.cwd || "Terminal";
      case "editor":
        return currentDescriptor.filePath || currentDescriptor.cwd;
      case "webview":
        return currentDescriptor.title || currentDescriptor.url;
    }
  };

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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-[min(95vw,1000px)] h-[520px] min-h-[320px] max-h-[90vh] p-0 gap-0 bg-surface border-white/10">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs text-white/60">
          <span>{getDisplayLabel()}</span>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleOpenAsTab}
              title="Open as tab"
              className="rounded-md p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white mr-6 mt-0.5"
            >
              <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
        <div className="flex flex-1 min-h-0 min-w-0">
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
      </DialogContent>
    </Dialog>
  );
}
