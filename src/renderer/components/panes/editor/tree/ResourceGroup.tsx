import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

type ResourceGroupProps = {
  label: string;
  count: number;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  actions?: React.ReactNode;
};

export function ResourceGroup({
  label,
  count,
  children,
  defaultExpanded = true,
  actions,
}: ResourceGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="resource-group">
      <div
        className="flex items-center px-3 py-1 text-xs font-semibold text-white/90 bg-white/5 hover:bg-white/10 cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 mr-1.5" />
        ) : (
          <ChevronRight className="w-4 h-4 mr-1.5" />
        )}
        <span className="flex-1">{label}</span>
        <span className="text-white/60 text-[11px] px-2 py-0.5 rounded bg-white/15 font-medium">
          {count}
        </span>
        {actions && (
          <div className="ml-2" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
      {isExpanded && <div className="pb-2">{children}</div>}
    </div>
  );
}
