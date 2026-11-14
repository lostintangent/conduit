import type { LucideIcon } from "lucide-react";
import { cn } from "@/utils/index";

type FillingIconProps = {
  /** The lucide-react icon component to render */
  icon: LucideIcon;
  /** Whether the filling animation is active */
  isAnimating?: boolean;
  /** Animation duration in seconds */
  duration?: number;
  /** Icon size */
  size?: number;
  /** Icon className */
  className?: string;
  /** Stroke width */
  strokeWidth?: number;
};

/**
 * FillingIcon - A component that wraps lucide-react icons with a bottom-to-top
 * "filling" animation effect. Shows a muted base icon with an accent-colored
 * fill that progressively reveals from bottom to top like liquid filling a glass.
 *
 * Uses CSS clip-path for optimal performance and browser support.
 *
 * @example
 * ```tsx
 * <FillingIcon
 *   icon={ArrowDownToLine}
 *   isAnimating={isPulling}
 *   duration={2}
 * />
 * ```
 */
export function FillingIcon({
  icon: Icon,
  isAnimating = false,
  duration = 2,
  size,
  className,
  strokeWidth,
}: FillingIconProps) {
  return (
    <div
      className={cn("filling-icon-wrapper relative inline-flex", className)}
      style={
        {
          "--fill-duration": `${duration}s`,
        } as React.CSSProperties
      }
    >
      {/* Base icon - always visible, inherits current text color */}
      <Icon
        size={size}
        strokeWidth={strokeWidth}
        style={{ color: "currentColor" }}
      />

      {/* Animated fill layer - bright blue filling from bottom to top */}
      {isAnimating && (
        <Icon
          size={size}
          strokeWidth={strokeWidth}
          className="filling-icon-active absolute inset-0"
          style={{ color: "var(--accent-bright)" }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
