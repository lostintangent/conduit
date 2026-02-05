import type { TabProgressState } from "@/store/atoms";
import { cn } from "@/utils";
import { Loader2 } from "lucide-react";

type AgentIndicatorProps = {
  progressState: TabProgressState;
  className?: string;
};

/**
 * Visual indicator for agent/task progress states.
 * Displays different indicators based on OSC 9;4 progress state:
 * - indeterminate: Spinning loader (agent thinking)
 * - error: Red dot
 * - warning: Yellow dot
 * - default: Blue dot (task in progress)
 */
export function AgentIndicator({
  progressState,
  className,
}: AgentIndicatorProps) {
  if (progressState === "hidden") {
    return null;
  }

  // Indeterminate state shows a spinner (agent is thinking/working)
  if (progressState === "indeterminate") {
    return (
      <Loader2
        size={14}
        className={cn("animate-spin text-blue-400", className)}
      />
    );
  }

  // Other states show colored dots
  const colorClass = {
    error: "bg-red-500",
    warning: "bg-[#FFBD2E]",
    default: "bg-blue-400",
  }[progressState];

  return (
    <span
      className={cn("w-2 h-2 rounded-full ml-0.5 mr-1", colorClass, className)}
    />
  );
}
