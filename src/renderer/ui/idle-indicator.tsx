import { cn } from "@/utils";

type IdleIndicatorProps = {
  tabState: string;
  className?: string;
};

export function IdleIndicator({ tabState, className }: IdleIndicatorProps) {
  if (tabState !== "idle-unseen" && tabState !== "idle-notified") {
    return null;
  }

  return (
    <span
      className={cn(
        "w-2 h-2 rounded-full ml-0.5 mr-1",
        tabState === "idle-notified" ? "bg-[#FFBD2E]" : "bg-blue-400",
        className,
      )}
    />
  );
}
