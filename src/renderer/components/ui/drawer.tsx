"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/utils/index";

const Drawer = ({
  shouldScaleBackground = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root
    shouldScaleBackground={shouldScaleBackground}
    {...props}
  />
);
Drawer.displayName = "Drawer";

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DrawerPrimitive.Portal>
    <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80" />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        "group fixed inset-x-0 z-50 flex h-auto flex-col border bg-background",
        "data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:rounded-t-[10px]",
        "data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:rounded-b-[10px]",
        className,
      )}
      {...props}
    >
      <div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted group-data-[vaul-drawer-direction=top]:order-last group-data-[vaul-drawer-direction=top]:mt-0 group-data-[vaul-drawer-direction=top]:mb-4" />
      {children}
    </DrawerPrimitive.Content>
  </DrawerPrimitive.Portal>
));
DrawerContent.displayName = "DrawerContent";

export { Drawer, DrawerContent };
