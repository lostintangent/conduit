import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils/index";
import type { FillPattern, FillStyle } from "@features/canvas/model";
import { ChevronDown } from "lucide-react";

// =============================================================================
// Types
// =============================================================================

type FillPickerProps = {
  fill: FillStyle | undefined;
  onFillChange: (fill: FillStyle | undefined) => void;
  disabled?: boolean;
  colors: readonly string[];
};

// =============================================================================
// Constants
// =============================================================================

const FILL_PATTERNS: Array<{
  pattern: FillPattern | "none";
  label: string;
}> = [
  { pattern: "none", label: "No fill" },
  { pattern: "solid", label: "Solid" },
  { pattern: "diagonal", label: "Diagonal" },
  { pattern: "cross", label: "Crosshatch" },
  { pattern: "dots", label: "Dots" },
];

// =============================================================================
// Sub-components
// =============================================================================

/**
 * Small icon preview of a fill pattern.
 */
function PatternIcon({
  pattern,
  color,
  size = 16,
  className,
}: {
  pattern: FillPattern | "none";
  color?: string;
  size?: number;
  className?: string;
}) {
  const strokeColor = color ?? "currentColor";

  if (pattern === "none") {
    // Dashed border, transparent inside
    return (
      <div
        className={cn(
          "rounded border border-dashed border-foreground/40",
          className,
        )}
        style={{ width: size, height: size }}
      />
    );
  }

  if (pattern === "solid") {
    return (
      <div
        className={cn("rounded border border-foreground/20", className)}
        style={{ width: size, height: size, backgroundColor: strokeColor }}
      />
    );
  }

  // SVG patterns for diagonal, cross, dots
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={cn("rounded border border-foreground/20", className)}
    >
      <rect width="16" height="16" fill="var(--background)" />
      {pattern === "diagonal" && (
        <g stroke={strokeColor} strokeWidth="1">
          <line x1="0" y1="6" x2="6" y2="0" />
          <line x1="0" y1="11" x2="11" y2="0" />
          <line x1="0" y1="16" x2="16" y2="0" />
          <line x1="5" y1="16" x2="16" y2="5" />
          <line x1="10" y1="16" x2="16" y2="10" />
        </g>
      )}
      {pattern === "cross" && (
        <g stroke={strokeColor} strokeWidth="1">
          <line x1="0" y1="16" x2="16" y2="0" />
          <line x1="0" y1="0" x2="16" y2="16" />
        </g>
      )}
      {pattern === "dots" && (
        <g fill={strokeColor}>
          <circle cx="5" cy="5" r="1.5" />
          <circle cx="11" cy="5" r="1.5" />
          <circle cx="5" cy="11" r="1.5" />
          <circle cx="11" cy="11" r="1.5" />
        </g>
      )}
    </svg>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function FillPicker({
  fill,
  onFillChange,
  disabled,
  colors,
}: FillPickerProps) {
  const currentPattern = fill?.pattern ?? "none";
  const currentColor = fill?.color ?? colors[0];

  const handlePatternSelect = (pattern: FillPattern | "none") => {
    if (pattern === "none") {
      onFillChange(undefined);
    } else {
      onFillChange({ pattern, color: currentColor });
    }
  };

  const handleColorSelect = (color: string) => {
    if (currentPattern === "none") {
      // If no pattern selected, default to solid when picking a color
      onFillChange({ pattern: "solid", color });
    } else {
      onFillChange({ pattern: currentPattern, color });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex items-center gap-1 p-1 rounded transition-colors",
            disabled
              ? "opacity-40 cursor-not-allowed"
              : "hover:bg-foreground/10",
          )}
        >
          <PatternIcon
            pattern={currentPattern}
            color={currentColor}
            size={16}
          />
          <ChevronDown size={12} className="opacity-50" />
        </button>
      </DropdownMenuTrigger>
      {!disabled && (
        <DropdownMenuContent align="start" className="p-2 w-[180px]">
          {/* Pattern selection */}
          <div className="flex gap-1 mb-2">
            {FILL_PATTERNS.map(({ pattern, label }) => (
              <button
                key={pattern}
                type="button"
                onClick={() => handlePatternSelect(pattern)}
                title={label}
                className={cn(
                  "p-1 rounded transition-all",
                  currentPattern === pattern
                    ? "bg-accent ring-1 ring-accent"
                    : "hover:bg-foreground/10",
                )}
              >
                <PatternIcon
                  pattern={pattern}
                  color={pattern === "none" ? undefined : currentColor}
                  size={20}
                />
              </button>
            ))}
          </div>

          {/* Color grid - only enabled when a pattern is selected */}
          <div
            className={cn(
              "grid grid-cols-4 gap-x-1 gap-y-2 pt-2 border-t border-foreground/10 justify-items-center",
              currentPattern === "none" && "opacity-40 pointer-events-none",
            )}
          >
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => handleColorSelect(color)}
                className={cn(
                  "w-6 h-6 rounded border transition-all",
                  fill?.color === color && currentPattern !== "none"
                    ? "border-accent ring-1 ring-accent"
                    : "border-foreground/20 hover:border-foreground/40",
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}
