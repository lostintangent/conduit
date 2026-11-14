import { useOnHide } from "@/hooks/useOnHide";
import { useRef, useState } from "react";

interface OpenChangeProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Closes a Radix menu, popover or tooltip when an `<Activity>` hides it, the
 * way macOS closes menus when focus leaves. Background tabs and the collapsed
 * sidebar stay mounted, so a menu left open would otherwise still be open when
 * they return. It remounts the root closed rather than just closing it,
 * because a hidden tree runs no effects, so Radix would replay its exit
 * animation and focus handling once the tree is shown again.
 */
export function useCloseWhenHidden({ open, onOpenChange }: OpenChangeProps) {
  const [generation, setGeneration] = useState(0);
  const isUncontrolledOpenRef = useRef(false);

  const handleOpenChange = (isOpen: boolean) => {
    isUncontrolledOpenRef.current = isOpen;
    onOpenChange?.(isOpen);
  };

  useOnHide(() => {
    if (!(open ?? isUncontrolledOpenRef.current)) return;
    isUncontrolledOpenRef.current = false;
    setGeneration((current) => current + 1);
    onOpenChange?.(false);
  });

  return { key: generation, onOpenChange: handleOpenChange };
}
