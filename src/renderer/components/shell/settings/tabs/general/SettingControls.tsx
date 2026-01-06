/**
 * Reusable Setting Controls for Advanced Settings Tab
 *
 * Provides consistent UI components for settings forms to reduce duplication.
 */

import { cn } from "@/utils";
import type React from "react";

/**
 * SettingSection - Container for a group of related settings
 *
 * Provides consistent styling for section headers and content areas.
 */
interface SettingSectionProps {
  title: string;
  children: React.ReactNode;
}

export function SettingSection({ title, children }: SettingSectionProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-tinted-foreground mb-4">
        {title}
      </h3>
      <div className="space-y-4 bg-tinted-muted rounded-lg p-4">{children}</div>
    </div>
  );
}

/**
 * CheckboxSetting - Checkbox input with label and description
 *
 * Used for boolean settings with explanatory text.
 */
interface CheckboxSettingProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function CheckboxSetting({
  id,
  label,
  description,
  checked,
  onChange,
}: CheckboxSettingProps) {
  return (
    <div className="flex items-start gap-3">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 bg-tinted border border-tinted-border rounded accent-accent"
      />
      <div className="flex-1">
        <label
          htmlFor={id}
          className="text-sm text-tinted-foreground/80 cursor-pointer"
        >
          {label}
        </label>
        <p className="text-xs text-tinted-foreground/50 mt-1">{description}</p>
      </div>
    </div>
  );
}

/**
 * TextInputSetting - Text or number input with label and optional description
 *
 * Supports both controlled text inputs and number inputs with validation.
 */
interface TextInputSettingProps {
  id: string;
  label: string;
  description?: string;
  value: string | number;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  type?: "text" | "number";
  className?: string;
  min?: number;
  max?: number;
}

export function TextInputSetting({
  id,
  label,
  description,
  value,
  onChange,
  onBlur,
  placeholder,
  type = "text",
  className,
  min,
  max,
}: TextInputSettingProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-sm text-tinted-foreground/80 block mb-2"
      >
        {label}
      </label>
      <input
        type={type}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        min={min}
        max={max}
        className={cn(
          "px-3 py-2 bg-tinted border border-tinted-border rounded text-sm text-tinted-foreground placeholder:text-tinted-foreground/40 focus:outline-none focus:border-accent",
          type === "number" ? "w-24" : "w-full",
          className,
        )}
      />
      {description && (
        <p className="text-xs text-tinted-foreground/50 mt-1">{description}</p>
      )}
    </div>
  );
}
