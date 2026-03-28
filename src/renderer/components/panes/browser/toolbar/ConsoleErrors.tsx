import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Check, Copy, Trash2 } from "lucide-react";
import { useState } from "react";

export type ConsoleMessage = {
  message: string;
  level: number;
  sourceId: string;
  line: number;
  timestamp: number;
};

type ConsoleErrorsProps = {
  errors: ConsoleMessage[];
  onClear: () => void;
  onRemove: (index: number) => void;
};

export function ConsoleErrors({
  errors,
  onClear,
  onRemove,
}: ConsoleErrorsProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (errors.length === 0) return null;

  const handleCopy = (error: ConsoleMessage, index: number) => {
    const fullText = `${getLevelLabel(error.level)}: ${error.message}\nSource: ${error.sourceId}:${error.line}`;
    navigator.clipboard.writeText(fullText);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const getLevelLabel = (level: number) => {
    switch (level) {
      case 0:
        return "Log";
      case 1:
        return "Warning";
      case 2:
        return "Error";
      default:
        return "Log";
    }
  };

  const getLevelColor = (level: number) => {
    switch (level) {
      case 1:
        return "text-yellow-500";
      case 2:
        return "text-destructive";
      default:
        return "text-foreground";
    }
  };

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="relative">
              <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-semibold bg-destructive text-white rounded-full">
                {errors.length}
              </span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Console errors ({errors.length})</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="w-[400px]">
        <div className="flex items-center justify-between">
          <DropdownMenuLabel>Console Errors</DropdownMenuLabel>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClear}
            className="mr-1 hover:text-destructive"
            aria-label="Clear all"
          >
            <Trash2 size={12} />
          </Button>
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-[300px] overflow-y-auto">
          {errors.map((error, index) => (
            <DropdownMenuItem
              key={`${error.timestamp}-${index}`}
              className="flex-col items-start cursor-default focus:bg-accent/50"
              onSelect={(e) => e.preventDefault()}
            >
              <div className="flex items-center gap-2 w-full">
                <span
                  className={`text-xs font-semibold ${getLevelColor(error.level)}`}
                >
                  {getLevelLabel(error.level)}
                </span>
                <span className="text-xs text-muted-foreground truncate flex-1">
                  {error.sourceId}:{error.line}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopy(error, index);
                  }}
                  aria-label="Copy error message"
                >
                  {copiedIndex === index ? (
                    <Check size={12} className="text-green-500" />
                  ) : (
                    <Copy size={12} />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(errors.indexOf(error));
                  }}
                  className="hover:text-destructive"
                  aria-label="Delete error"
                >
                  <Trash2 size={12} />
                </Button>
              </div>
              <div className="text-xs mt-1 break-words w-full">
                {error.message}
              </div>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
