import { ComponentPropsWithoutRef, FC } from "react";

import { cn } from "@/utils/index";

export const AnimatedShinyText: FC<ComponentPropsWithoutRef<"span">> = ({
  children,
  className,
  ...props
}) => {
  return (
    <span
      className={cn(
        "relative isolate mx-auto max-w-md overflow-clip text-neutral-600/70 dark:text-neutral-400/70",
        className,
      )}
      {...props}
    >
      {children}
      {/* The shine: a 100px band under the text that fades out at both
          edges and shows a brighter copy of the text. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 animate-shiny-text select-none"
      >
        <span className="block h-full w-[100px] [mask-image:linear-gradient(to_right,transparent,black,transparent)]">
          <span className="absolute inset-0 truncate animate-shiny-text-counter bg-clip-text text-transparent light:bg-black/80 dark:bg-white/80">
            {children}
          </span>
        </span>
      </span>
    </span>
  );
};
