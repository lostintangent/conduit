import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEffect, useState } from "react";

type RepositoryDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (repo?: { owner: string; name: string }) => void;
  title?: string;
  description?: string;
};

/**
 * Parse a GitHub repo URL or owner/name string into structured data
 * Supports formats like:
 * - https://github.com/owner/repo
 * - github.com/owner/repo
 * - owner/repo
 */
function parseRepoInput(input: string): { owner: string; name: string } | null {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  // Remove trailing .git if present
  const normalized = trimmed.replace(/\.git$/, "");

  // Try to match GitHub URL patterns
  const urlMatch = normalized.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/\s]+)/,
  );

  if (urlMatch) {
    return {
      owner: urlMatch[1],
      name: urlMatch[2],
    };
  }

  // Try simple owner/repo format
  const simpleMatch = normalized.match(/^([^/\s]+)\/([^/\s]+)$/);

  if (simpleMatch) {
    return {
      owner: simpleMatch[1],
      name: simpleMatch[2],
    };
  }

  return null;
}

export function RepositoryDialog({
  isOpen,
  onClose,
  onSubmit,
  title = "Clone GitHub Repository",
  description = "Enter a GitHub repository URL (optional). Leave empty to start with a clean VM.",
}: RepositoryDialogProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setValue("");
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = value.trim();

    // If empty, submit without repo
    if (!trimmed) {
      onSubmit(undefined);
      onClose();
      return;
    }

    // Try to parse the input
    const parsed = parseRepoInput(trimmed);

    if (!parsed) {
      setError("Invalid repository format. Use 'owner/repo' or a GitHub URL.");
      return;
    }

    setError(null);
    onSubmit(parsed);
    onClose();
  };

  const handleSkip = () => {
    onSubmit(undefined);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-popover border-border">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground pt-2">
            {description}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-2">
            <input
              autoFocus
              className="w-full py-2.5 px-3 rounded-lg border border-muted bg-input text-inherit font-[inherit] text-[0.95rem] focus:outline-2 focus:outline-ring focus:outline-offset-2"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              placeholder="e.g., owner/repo or https://github.com/owner/repo"
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <p className="text-xs text-muted-foreground">
              Examples: octocat/Hello-World, github.com/owner/repo
            </p>
          </div>

          <DialogFooter className="mt-4 gap-2">
            <button
              type="button"
              onClick={handleSkip}
              className="border border-muted bg-transparent rounded-lg py-1.5 px-3.5 text-inherit font-[inherit] text-[0.9rem] cursor-pointer transition-colors duration-150 hover:bg-white/5"
            >
              Skip
            </button>
            <button
              type="submit"
              className="magic border-transparent rounded-lg py-1.5 px-3.5 font-[inherit] text-[0.9rem] cursor-pointer transition-[filter] duration-150 hover:brightness-105"
            >
              Create VM
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
