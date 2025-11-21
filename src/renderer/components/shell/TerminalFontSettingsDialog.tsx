import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEffect, useState } from "react";

type TerminalFontSettingsDialogProps = {
  isOpen: boolean;
  initialFontFamily: string | undefined;
  initialFontSize: number | undefined;
  onClose: () => void;
  onSave: (fontFamily: string, fontSize: number) => void;
};

export const defaultFontFamily =
  '"Fira Code", Menlo, Monaco, "Courier New", monospace';
export const defaultFontSize = 13;

export function TerminalFontSettingsDialog({
  isOpen,
  initialFontFamily,
  initialFontSize,
  onClose,
  onSave,
}: TerminalFontSettingsDialogProps) {
  const [fontFamily, setFontFamily] = useState(
    initialFontFamily || defaultFontFamily,
  );
  const [fontSize, setFontSize] = useState(
    initialFontSize?.toString() || defaultFontSize.toString(),
  );

  useEffect(() => {
    if (isOpen) {
      setFontFamily(initialFontFamily || defaultFontFamily);
      setFontSize(initialFontSize?.toString() || defaultFontSize.toString());
    }
  }, [isOpen, initialFontFamily, initialFontSize]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedFontSize = parseInt(fontSize, 10);
    if (isNaN(parsedFontSize) || parsedFontSize < 8 || parsedFontSize > 72) {
      return;
    }
    onSave(fontFamily, parsedFontSize);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-[525px] bg-popover border-border"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>Terminal Font Settings</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="fontFamily"
                className="block text-sm font-medium mb-1.5"
              >
                Font Family
              </label>
              <input
                id="fontFamily"
                autoFocus
                className="w-full py-2.5 px-3 rounded-lg border border-muted bg-input text-inherit font-[inherit] text-[0.95rem] focus:outline-2 focus:outline-ring focus:outline-offset-2"
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                placeholder={defaultFontFamily}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Comma-separated list of font names with fallbacks
              </p>
            </div>

            <div>
              <label
                htmlFor="fontSize"
                className="block text-sm font-medium mb-1.5"
              >
                Font Size
              </label>
              <input
                id="fontSize"
                type="number"
                min="8"
                max="72"
                className="w-full py-2.5 px-3 rounded-lg border border-muted bg-input text-inherit font-[inherit] text-[0.95rem] focus:outline-2 focus:outline-ring focus:outline-offset-2"
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value)}
                placeholder={defaultFontSize.toString()}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Size in pixels (8-72)
              </p>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <button
              type="button"
              onClick={onClose}
              className="border border-border rounded-lg py-1.5 px-3.5 text-[0.9rem] cursor-pointer transition-[filter] duration-150 hover:bg-accent mr-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="magic border-transparent rounded-lg py-1.5 px-3.5 text-[0.9rem] cursor-pointer transition-[filter] duration-150 hover:brightness-105"
            >
              Save
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
