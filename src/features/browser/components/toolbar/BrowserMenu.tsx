import { useCommand } from "@/commands/hooks/useCommand";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { enqueueNotification } from "@/store/actions/notifications";
import { ApplicationCommands } from "@shared/commands";
import { BrowserPage } from "@features/settings/model";
import {
  Camera,
  Check,
  Code,
  Copy,
  ExternalLink,
  EyeOff,
  Minimize2,
  MoreVertical,
  X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";

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

  const collapsePane = useCommand(ApplicationCommands.PANE_COLLAPSE);
  const closePane = useCommand(ApplicationCommands.PANE_CLOSE);

  const showCheckmarkWithTimer = useCallback(() => {
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
  }, []);

  const handleCaptureScreenshot = useCallback(async () => {
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
  }, [onCaptureScreenshot, showCheckmarkWithTimer]);

  const handleCopyUrl = useCallback(() => {
    navigator.clipboard.writeText(currentPage.url);
    showCheckmarkWithTimer();
  }, [currentPage.url, showCheckmarkWithTimer]);

  return (
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
        <DropdownMenuItem onClick={() => api.openExternal(currentPage.url)}>
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
  );
}
