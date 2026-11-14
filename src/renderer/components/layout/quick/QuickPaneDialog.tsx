import { EditorPaneAnchor } from "@/components/panes/editor";
import { TerminalPane } from "@/components/panes/terminal/TerminalPane";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { applicationModeAtom } from "@/store/atoms";
import type { EditorPane as EditorPaneType, Pane } from "@/types";
import { generateId } from "@shared/utils";
import { useSetAtom } from "jotai";
import { ArrowUpRight, PictureInPicture2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// Omit each pane variant separately so narrowing on `type` keeps its fields.
export type PaneDescriptor = Pane extends infer P
  ? P extends Pane
    ? Omit<P, "id">
    : never
  : never;

// Quick panes only host terminals and editors.
export type QuickPaneDescriptor = Extract<
  PaneDescriptor,
  { type: "terminal" | "editor" }
> & {
  closeOnSave?: boolean;
  onClose?: () => void;
};

type QuickPaneDialogProps = {
  paneDescriptor: QuickPaneDescriptor;
  onClose: () => void;
  onOpenAsTab: (descriptor: PaneDescriptor) => void;
  onOpenAsFloating?: (terminalId: string, paneId: string) => void;
};

export function QuickPaneDialog({
  paneDescriptor,
  onClose,
  onOpenAsTab,
  onOpenAsFloating,
}: QuickPaneDialogProps) {
  const setApplicationMode = useSetAtom(applicationModeAtom);
  const [currentDescriptor, setCurrentDescriptor] =
    useState<QuickPaneDescriptor>(paneDescriptor);

  // Generate a stable paneId for the quick pane
  const [quickPaneId] = useState(() => generateId());

  // Ref to the dialog content for scoped queries
  const dialogContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setApplicationMode("quick");
    return () => {
      setApplicationMode((current) =>
        current === "quick" ? "normal" : current,
      );
    };
  }, [setApplicationMode]);

  // Focus the Monaco editor when dialog opens
  const handleOpenAutoFocus = useCallback(
    (e: Event) => {
      if (currentDescriptor.type === "editor") {
        e.preventDefault();

        // Wait for dialog to render, then click the editor to focus it
        setTimeout(() => {
          const viewLines = dialogContentRef.current?.querySelector(
            ".monaco-editor .view-lines",
          ) as HTMLElement;
          viewLines?.click();
        }, 200);
      }
    },
    [currentDescriptor.type],
  );

  // Handle updates from editor pane
  const handleEditorUpdate = useCallback(
    (updates: Partial<EditorPaneType>) => {
      if (currentDescriptor.type === "editor") {
        setCurrentDescriptor((prev) =>
          prev.type === "editor" ? { ...prev, ...updates } : prev,
        );
      }
    },
    [currentDescriptor.type],
  );

  const handleOpenAsTabClick = useCallback(() => {
    const {
      onClose: _onClose,
      closeOnSave: _closeOnSave,
      ...rest
    } = currentDescriptor;

    onOpenAsTab(rest);
  }, [currentDescriptor, onOpenAsTab]);

  const handleOpenAsFloatingClick = useCallback(() => {
    if (currentDescriptor.type === "terminal" && onOpenAsFloating) {
      onOpenAsFloating(currentDescriptor.sessionId, quickPaneId);
      onClose();
    }
  }, [currentDescriptor, onOpenAsFloating, quickPaneId, onClose]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        ref={dialogContentRef}
        showClose={false}
        overlayClassName="bg-black"
        className="flex max-w-[min(95vw,1000px)] h-[720px] min-h-[320px] max-h-[90vh] overflow-hidden p-0 bg-background border-white/10"
        aria-describedby={undefined}
        onOpenAutoFocus={handleOpenAutoFocus}
      >
        <DialogTitle className="sr-only">Quick Pane</DialogTitle>
        <div className="flex flex-1 w-full h-full min-h-0 min-w-0 overflow-hidden">
          {currentDescriptor.type === "terminal" && (
            <TerminalPane
              pane={{
                ...currentDescriptor,
                id: quickPaneId,
                type: "terminal",
              }}
              isActive
            />
          )}
          {currentDescriptor.type === "editor" && (
            <EditorPaneAnchor
              paneId={quickPaneId}
              pane={{
                id: quickPaneId,
                type: "editor",
                cwd: currentDescriptor.cwd,
                file: currentDescriptor.file,
                treeMode: currentDescriptor.treeMode,
              }}
              onCwdChange={(cwd) => handleEditorUpdate({ cwd })}
              onFileChange={({ file }) => handleEditorUpdate({ file })}
              onClearFile={() => handleEditorUpdate({ file: undefined })}
              onTreeModeChange={(mode) =>
                handleEditorUpdate({ treeMode: mode })
              }
              hideFileTree={currentDescriptor.closeOnSave}
              onSave={() => {
                if (currentDescriptor.closeOnSave) {
                  onClose();
                }
              }}
              onClose={onClose}
              className="h-full w-full"
            />
          )}
        </div>

        <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-2 text-white">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/50 px-3 py-2 shadow-lg backdrop-blur">
            {currentDescriptor.type === "terminal" && onOpenAsFloating && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleOpenAsFloatingClick}
                    aria-label="Open as floating overlay"
                    className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white"
                  >
                    <PictureInPicture2 size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Hyper Terminal</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleOpenAsTabClick}
                  aria-label="Open in tab"
                  className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white"
                >
                  <ArrowUpRight size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Open in tab</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close dialog"
                  className="rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white"
                >
                  <X size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
