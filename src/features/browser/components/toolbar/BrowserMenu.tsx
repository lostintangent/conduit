import { useCommand } from "@/commands/hooks/useCommand";
import { Button } from "@/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import { libraryMutations, useLibrary } from "@features/browser/client/queries";
import { enqueueNotification } from "@features/workbench/client/actions/notifications";
import { ApplicationCommands } from "@shared/commands";
import type { BrowserPage } from "@features/browser/model";
import { useMutation } from "@tanstack/react-query";
import {
  Camera,
  Check,
  Code,
  Copy,
  ExternalLink,
  EyeOff,
  History,
  Minimize2,
  MoreVertical,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

const api = window.conduit;

type BrowserMenuProps = {
  currentPage: BrowserPage;
  isDevToolsOpen: boolean;
  onToggleDevTools: () => void;
  onHideToolbar: () => void;
  onCaptureScreenshot: () => Promise<void>;
  tabId?: string; // Optional - undefined when in sidebar mode
};

export function BrowserMenu({
  currentPage,
  isDevToolsOpen,
  onToggleDevTools,
  onHideToolbar,
  onCaptureScreenshot,
  tabId,
}: BrowserMenuProps) {
  // When tabId is undefined, we're in sidebar mode
  const isInSidebar = tabId === undefined;
  const [showCheckmark, setShowCheckmark] = useState(false);
  const checkmarkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const hasHistory = useLibrary((library) => library.history.length > 0);
  const { mutate: clearHistory } = useMutation(libraryMutations.clearHistory());
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  const collapsePane = useCommand(ApplicationCommands.PANE_COLLAPSE);
  const closePane = useCommand(ApplicationCommands.PANE_CLOSE);

  const showCheckmarkWithTimer = () => {
    setShowCheckmark(true);

    // Clear any existing timeout
    if (checkmarkTimeoutRef.current) {
      clearTimeout(checkmarkTimeoutRef.current);
    }

    // Hide the checkmark after 2 seconds. This isn't cleared on unmount, so
    // it still runs while the tab is hidden, since a hidden tab keeps its state.
    checkmarkTimeoutRef.current = setTimeout(() => {
      setShowCheckmark(false);
    }, 2000);
  };

  const handleCaptureScreenshot = async () => {
    try {
      await onCaptureScreenshot();
      showCheckmarkWithTimer();
    } catch (error) {
      enqueueNotification({
        kind: "error",
        message: "Failed to copy screenshot",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(currentPage.url);
    showCheckmarkWithTimer();
  };

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="More options"
              >
                {showCheckmark ? (
                  <Check size={12} className="text-green-500" />
                ) : (
                  <MoreVertical size={12} />
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>More options</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleCopyUrl}>
            <Copy size={12} />
            Copy URL
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => api.workbench.openExternal(currentPage.url)}
          >
            <ExternalLink size={12} />
            Open in browser
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleCaptureScreenshot}>
            <Camera size={12} />
            Copy screenshot
          </DropdownMenuItem>
          {/* Pane-specific items - hidden when in sidebar */}
          {!isInSidebar && (
            <>
              <DropdownMenuItem onClick={onToggleDevTools}>
                <Code size={12} />
                {isDevToolsOpen ? "Close dev tools" : "Open dev tools"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onHideToolbar}>
                <EyeOff size={12} />
                Hide toolbar
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!hasHistory}
            onClick={() => setIsConfirmingClear(true)}
          >
            <History size={12} />
            Clear history…
          </DropdownMenuItem>
          {!isInSidebar && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={collapsePane.execute}>
                <Minimize2 size={12} />
                Collapse browser
              </DropdownMenuItem>
              <DropdownMenuItem onClick={closePane.execute}>
                <X size={12} />
                Close browser
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        isOpen={isConfirmingClear}
        title="Clear history?"
        description="The address bar will stop suggesting the pages you've visited. Your starred pages stay."
        confirmLabel="Clear"
        variant="destructive"
        onConfirm={() => {
          clearHistory();
          setIsConfirmingClear(false);
        }}
        onCancel={() => setIsConfirmingClear(false)}
      />
    </>
  );
}
