import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { useCloseWhenHidden } from "@/hooks/useCloseWhenHidden";
import { cn } from "@/utils/index";

const TooltipProvider = TooltipPrimitive.Provider;

function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const { key, onOpenChange } = useCloseWhenHidden(props);
  return (
    <TooltipPrimitive.Root key={key} {...props} onOpenChange={onOpenChange} />
  );
}

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-tooltip-content-transform-origin]",
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
