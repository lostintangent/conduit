import { cn } from "@/utils/index";

interface DiffStatProps {
  added: number;
  removed: number;
  className?: string;
  showLabels?: boolean;
  maxBlocks?: number;
}

export function DiffStat({
  added,
  removed,
  className,
  showLabels = true,
  maxBlocks = 5,
}: DiffStatProps) {
  const total = added + removed;

  if (total === 0) {
    return null;
  }

  // Calculate blocks to show (capped at maxBlocks)
  const totalBlocks = Math.min(maxBlocks, Math.ceil(total / 100));
  const addedBlocks = total > 0 ? Math.round((added / total) * totalBlocks) : 0;
  const _removedBlocks = totalBlocks - addedBlocks;

  return (
    <div className={cn("flex items-center gap-1.5 text-xs", className)}>
      {showLabels && (
        <>
          <span className="text-green-500">+{added}</span>
          <span className="text-red-500">-{removed}</span>
        </>
      )}

      <div className="flex items-center gap-0.5">
        {Array.from({ length: totalBlocks }).map((_, i) => {
          const isAdded = i < addedBlocks;
          return (
            <div
              key={`block-${i}`}
              className={cn(
                "w-2 h-2 rounded-sm",
                isAdded ? "bg-green-500" : "bg-red-500",
              )}
              title={`${added} additions, ${removed} deletions`}
            />
          );
        })}
      </div>
    </div>
  );
}
