import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";

const api = window.conduit;

type DuplicateTabDialogProps = {
  isOpen: boolean;
  initialCwd: string;
  initialTitle: string;
  onClose: () => void;
  onSave: (cwd: string, title?: string) => void;
};

export function DuplicateTabDialog({
  isOpen,
  initialCwd = "",
  initialTitle = "",
  onClose,
  onSave,
}: DuplicateTabDialogProps) {
  const [cwd, setCwd] = useState(initialCwd);
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (isOpen) {
      setCwd(initialCwd);
      setTitle("");
    }
  }, [isOpen, initialCwd]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(cwd, title.trim() || undefined);
  };

  const handleFolderPicker = async () => {
    const selectedPath = await api.showFolderPicker(cwd || undefined);
    if (selectedPath) {
      setCwd(selectedPath);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-surface-elevated border-border">
        <DialogHeader>
          <DialogTitle>Duplicate tab with custom directory</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="cwd-input"
                className="block text-sm font-medium mb-2 text-text-secondary"
              >
                Working Directory
              </label>
              <div className="flex gap-2">
                <input
                  id="cwd-input"
                  autoFocus
                  className="flex-1 py-2.5 px-3 rounded-lg border border-border-muted bg-input text-inherit font-[inherit] text-[0.95rem] focus:outline-2 focus:outline-[var(--color-focus-ring)] focus:outline-offset-2"
                  value={cwd}
                  onChange={(e) => setCwd(e.target.value)}
                  placeholder="Enter working directory path..."
                />
                <button
                  type="button"
                  onClick={handleFolderPicker}
                  className="p-2.5 rounded-lg border border-border-muted bg-input hover:bg-surface-hover transition-colors"
                  aria-label="Browse for folder"
                  title="Browse for folder"
                >
                  <FolderOpen className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="title-input"
                className="block text-sm font-medium mb-2 text-text-secondary"
              >
                Tab Name (Optional)
              </label>
              <input
                id="title-input"
                className="w-full py-2.5 px-3 rounded-lg border border-border-muted bg-input text-inherit font-[inherit] text-[0.95rem] focus:outline-2 focus:outline-[var(--color-focus-ring)] focus:outline-offset-2"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={initialTitle}
              />
              <p className="mt-1.5 text-xs text-text-tertiary">
                Leave blank to auto-generate name
              </p>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <button
              type="submit"
              className="magic border-transparent rounded-lg py-1.5 px-3.5 text-[0.9rem] cursor-pointer transition-[filter] duration-150 hover:brightness-105"
            >
              Duplicate Tab
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
