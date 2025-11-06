import { handleConnectToVM } from "@/commands/handlers";
import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

type ConnectToVMDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function ConnectToVMDialog({
  isOpen,
  onClose,
}: ConnectToVMDialogProps) {
  const [vmId, setVmId] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    
    // Reset input when dialog opens
    setVmId("");
  }, [isOpen]);

  const handleConnect = useCallback(
    async (event?: React.FormEvent) => {
      if (event) {
        event.preventDefault();
      }

      const trimmedVmId = vmId.trim();
      if (!trimmedVmId) {
        return;
      }

      await handleConnectToVM(trimmedVmId);
      onClose();
    },
    [vmId, onClose]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void handleConnect();
      }
    },
    [handleConnect]
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect to Existing VM</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleConnect} className="space-y-4">
          <div>
            <label
              htmlFor="vm-id-input"
              className="block text-sm font-medium mb-2"
            >
              VM ID
            </label>
            <input
              id="vm-id-input"
              type="text"
              value={vmId}
              onChange={(e) => setVmId(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter VM ID to connect"
              className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-md focus:outline-none focus:ring-2 focus:ring-white/20"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md bg-white/5 hover:bg-white/10 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!vmId.trim()}
              className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Connect
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
