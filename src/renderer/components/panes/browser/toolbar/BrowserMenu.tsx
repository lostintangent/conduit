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
import { ApplicationCommands } from "@shared/commands";
import { BrowserPage } from "@shared/types";
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
import { useCallback, useEffect, useRef, useState } from "react";

const api = window.conduit;

type BrowserMenuProps = {
  currentPage: BrowserPage;
  isDevToolsOpen: boolean;
  onToggleDevTools: () => void;
  onHideToolbar: () => void;
  onCaptureScreenshot: () => void;
};

export function BrowserMenu({
  currentPage,
  isDevToolsOpen,
  onToggleDevTools,
  onHideToolbar,
  onCaptureScreenshot,
}: BrowserMenuProps) {
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

    // Set timeout to hide checkmark after 2 seconds
    checkmarkTimeoutRef.current = setTimeout(() => {
      setShowCheckmark(false);
    }, 2000);
  }, []);

  const handleCaptureScreenshot = useCallback(() => {
    onCaptureScreenshot();
    showCheckmarkWithTimer();
  }, [onCaptureScreenshot, showCheckmarkWithTimer]);

  const handleCopyUrl = useCallback(() => {
    navigator.clipboard.writeText(currentPage.url);
    showCheckmarkWithTimer();
  }, [currentPage.url, showCheckmarkWithTimer]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (checkmarkTimeoutRef.current) {
        clearTimeout(checkmarkTimeoutRef.current);
      }
    };
  }, []);

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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
