import { Separator } from "@/components/ui/separator";
import { Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";

const api = window.conduit;

export const WindowControls = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // Check initial maximized state
    api.isWindowMaximized().then(setIsMaximized);
  }, []);

  const handleMinimize = () => {
    api.minimizeWindow();
  };

  const handleMaximize = () => {
    api.maximizeWindow();
    setIsMaximized(!isMaximized);
  };

  const handleClose = () => {
    api.closeWindow();
  };

  return (
    <div className="flex items-center gap-1">
      <Separator
        orientation="vertical"
        className="h-4.5 mt-[3px] bg-elevated-border"
      />
      <button
        className="p-1 rounded hover:bg-foreground/10 transition-colors"
        onClick={handleMinimize}
        aria-label="Minimize window"
      >
        <Minus className="w-4 h-4" />
      </button>
      <button
        className="p-1 rounded hover:bg-foreground/10 transition-colors"
        onClick={handleMaximize}
        aria-label={isMaximized ? "Restore window" : "Maximize window"}
      >
        <Square className="w-4 h-4" />
      </button>
      <button
        className="p-1 rounded hover:bg-destructive/80 hover:text-destructive-foreground transition-colors"
        onClick={handleClose}
        aria-label="Close window"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
