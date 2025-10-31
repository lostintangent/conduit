import { EditorPane } from "@/components/panes/editor/EditorPane";
import { TerminalPane } from "@/components/panes/terminal/TerminalPane";
import { WebPane } from "@/components/panes/web/WebPane";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { applicationModeAtom } from "@/store/atoms";
import type { Pane } from "@/types";
import { generateId } from "@/utils/id";
import type { FileTreeNode } from "@shared/types";
import { useSetAtom } from "jotai";
import { ArrowUpRight, Cloud, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

export type PaneDescriptor = Omit<Pane, "id">;

type QuickDialogProps = {
  paneDescriptor: PaneDescriptor;
  onClose: () => void;
  onOpenAsTab: (descriptor: PaneDescriptor) => void;
};

export function QuickDialog({
  paneDescriptor,
  onClose,
  onOpenAsTab,
}: QuickDialogProps) {
  const setApplicationMode = useSetAtom(applicationModeAtom);
  const [currentDescriptor, setCurrentDescriptor] =
    useState<PaneDescriptor>(paneDescriptor);

  // Generate a stable paneId for the quick pane
  const [quickPaneId] = useState(() => generateId());

  useEffect(() => {
    setApplicationMode("quick");
    return () => {
      setApplicationMode((current) =>
        current === "quick" ? "normal" : current
      );
    };
  }, [setApplicationMode]);

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

  const isVmTerminal = useMemo(
    () =>
      currentDescriptor.type === "terminal" &&
      !!currentDescriptor.vmMetadata?.vmId,
    [currentDescriptor]
  );
  const vmTitle = useMemo(() => {
    if (!isVmTerminal) {
      return undefined;
    }
    return `Connected to VM ${currentDescriptor.vmMetadata?.vmId ?? ""}`;
  }, [currentDescriptor, isVmTerminal]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        showClose={false}
        className="flex max-w-[min(95vw,1000px)] h-[720px] min-h-[320px] max-h-[90vh] overflow-hidden p-0 bg-surface border-white/10"
      >
        <div className="flex flex-1 w-full h-full min-h-0 min-w-0 overflow-hidden">
          {currentDescriptor.type === "terminal" && (
            <TerminalPane
              terminalId={currentDescriptor.sessionId}
              paneId={quickPaneId}
              isActive
            />
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
          <div
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/50 px-3 py-2 shadow-lg backdrop-blur"
            title={vmTitle}
          >
            {isVmTerminal && (
              <Cloud size={16} className="text-white/80 mr-2" aria-hidden="true" />
            )}
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
