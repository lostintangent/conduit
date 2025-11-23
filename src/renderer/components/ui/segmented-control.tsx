import { cn } from "@/utils/index";
import React from "react";

interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  tooltip?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedControlOption<T>[];
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "sm",
}: SegmentedControlProps<T>) {
  const sizeClasses = {
    sm: "h-7 text-xs",
    md: "h-8 text-sm",
    lg: "h-9 text-base",
  };

  const paddingClasses = {
    sm: "px-2",
    md: "px-3",
    lg: "px-4",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md bg-muted/30 p-0.5",
        className,
      )}
      role="radiogroup"
    >
      {options.map((option) => {
        const isSelected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(option.value)}
            title={option.tooltip || option.label}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-[0.25rem] font-medium transition-all",
              sizeClasses[size],
              paddingClasses[size],
              isSelected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.icon && <span className="shrink-0">{option.icon}</span>}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
