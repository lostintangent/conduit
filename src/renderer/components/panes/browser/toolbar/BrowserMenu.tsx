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
import { useCommand } from "@/commands/hooks/useCommand";
import { ApplicationCommands } from "@shared/commands";
import { BrowserPage } from "@shared/types";
import {
  Camera,
  Check,
  Code,
  Copy,
  ExternalLink,
  MoreVertical,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const api = window.conduit;

type BrowserMenuProps = {
  currentPage: BrowserPage;
  onOpenDevTools: () => void;
  onCaptureScreenshot: () => void;
};

export function BrowserMenu({
  currentPage,
  onOpenDevTools,
  onCaptureScreenshot,
}: BrowserMenuProps) {
  const [showCheckmark, setShowCheckmark] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const closePane = useCommand(ApplicationCommands.PANE_CLOSE);

  const showCheckmarkWithTimer = useCallback(() => {
    setShowCheckmark(true);

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set timeout to hide checkmark after 2 seconds
    timeoutRef.current = setTimeout(() => {
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
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
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
        <DropdownMenuItem onClick={onOpenDevTools}>
          <Code size={12} />
          Open dev tools
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={closePane.execute}>
          <X size={12} />
          Close browser
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
