import {
  ArrowRight,
  ChevronDown,
  Circle,
  Eraser,
  Hand,
  Minus,
  MousePointer2,
  Pen,
  Redo2,
  Square,
  Type,
  Undo2,
} from "lucide-react";
import type { CanvasTool, ShapeType } from "@shared/types/canvas";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils/index";
import { ActionsMenu } from "./ActionsMenu";
import { ZoomControls } from "./ZoomControls";

// =============================================================================
// Types
// =============================================================================

type CanvasToolbarProps = {
  tool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  strokeColor: string;
  onStrokeColorChange: (color: string) => void;
  strokeWidth: number;
  onStrokeWidthChange: (size: number) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  shapeType: ShapeType;
  onShapeTypeChange: (shapeType: ShapeType) => void;
  onClear: () => void;
  onCopyToClipboard: () => void;
  onAddImage: () => void;
  showCopySuccess?: boolean;
  // Zoom controls
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onZoomToFit: () => void;
  // Undo/Redo
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  // Selection - for editing selected element styles
  hasStylableSelection: boolean;
  hasWidthSupport?: boolean;
  selectedColor?: string;
  selectedWidth?: number;
  // Space key state - shows hand tool as temporarily active
  isSpacePressed?: boolean;
  // Tab ID for pane commands
  tabId?: string;
};

// =============================================================================
// Constants
// =============================================================================

const PRESET_COLORS = [
  "#000000", // Black
  "#ffffff", // White
  "#ef4444", // Red
  "#22c55e", // Green
  "#3b82f6", // Blue
  "#eab308", // Yellow
  "#a855f7", // Purple
  "#06b6d4", // Cyan
];

const STROKE_WIDTHS = [1, 2, 4, 8, 16];
const FONT_SIZES = [12, 16, 20, 24, 32, 48];

const SHAPE_OPTIONS: Array<{
  type: ShapeType;
  icon: React.ReactNode;
  label: string;
}> = [
  { type: "rectangle", icon: <Square size={14} />, label: "Rectangle" },
  { type: "ellipse", icon: <Circle size={14} />, label: "Ellipse" },
  { type: "line", icon: <Minus size={14} />, label: "Line" },
  { type: "arrow", icon: <ArrowRight size={14} />, label: "Arrow" },
];

// =============================================================================
// Sub-components
// =============================================================================

type ToolButtonProps = {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  tooltip: string;
  /** Shows a muted selection state (when tool is selected but temporarily overridden) */
  muted?: boolean;
};

function ToolButton({
  active,
  onClick,
  icon,
  tooltip,
  muted,
}: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "p-1 rounded transition-colors shrink-0",
            active
              ? "bg-accent text-accent-foreground"
              : muted
                ? "bg-foreground/10 text-muted-foreground"
                : "hover:bg-foreground/10",
          )}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

type ColorPickerProps = {
  color: string;
  onColorChange: (color: string) => void;
  disabled?: boolean;
};

function ColorPicker({ color, onColorChange, disabled }: ColorPickerProps) {
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
          <div
            className="w-4 h-4 rounded border border-foreground/20"
            style={{ backgroundColor: color }}
          />
          <ChevronDown size={12} className="opacity-50" />
        </button>
      </DropdownMenuTrigger>
      {!disabled && (
        <DropdownMenuContent align="start" className="p-2">
          <div className="grid grid-cols-4 gap-1">
            {PRESET_COLORS.map((presetColor) => (
              <button
                key={presetColor}
                type="button"
                onClick={() => onColorChange(presetColor)}
                className={cn(
                  "w-6 h-6 rounded border transition-all",
                  color === presetColor
                    ? "border-accent ring-1 ring-accent"
                    : "border-foreground/20 hover:border-foreground/40",
                )}
                style={{ backgroundColor: presetColor }}
              />
            ))}
          </div>
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}

type SizeSelectorProps = {
  size: number;
  sizes: number[];
  onSizeChange: (size: number) => void;
  label: string;
  disabled?: boolean;
};

function SizeSelector({
  size,
  sizes,
  onSizeChange,
  label,
  disabled,
}: SizeSelectorProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex items-center gap-1 px-1.5 py-1 rounded transition-colors text-xs min-w-[40px] justify-between",
            disabled
              ? "opacity-40 cursor-not-allowed"
              : "hover:bg-foreground/10",
          )}
        >
          <span>{size}</span>
          <ChevronDown size={12} className="opacity-50" />
        </button>
      </DropdownMenuTrigger>
      {!disabled && (
        <DropdownMenuContent align="start">
          {sizes.map((s) => (
            <DropdownMenuItem
              key={s}
              onClick={() => onSizeChange(s)}
              className={cn(size === s && "bg-accent")}
            >
              {label} {s}px
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}

type ShapePickerProps = {
  active: boolean;
  shapeType: ShapeType;
  onToolChange: (tool: CanvasTool) => void;
  onShapeTypeChange: (shapeType: ShapeType) => void;
  /** Shows a muted selection state (when tool is selected but temporarily overridden) */
  muted?: boolean;
};

function ShapePicker({
  active,
  shapeType,
  onToolChange,
  onShapeTypeChange,
  muted,
}: ShapePickerProps) {
  const currentShape =
    SHAPE_OPTIONS.find((s) => s.type === shapeType) ?? SHAPE_OPTIONS[0];

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={() => onToolChange("shape")}
              className={cn(
                "flex items-center gap-0.5 p-1 rounded transition-colors shrink-0",
                active
                  ? "bg-accent text-accent-foreground"
                  : muted
                    ? "bg-foreground/10 text-muted-foreground"
                    : "hover:bg-foreground/10",
              )}
            >
              {currentShape.icon}
              <ChevronDown size={10} className="opacity-50" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Shape tool ({currentShape.label})</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start">
        {SHAPE_OPTIONS.map((shape) => (
          <DropdownMenuItem
            key={shape.type}
            onClick={() => {
              onShapeTypeChange(shape.type);
              onToolChange("shape");
            }}
            className={cn(
              "flex items-center gap-2",
              shapeType === shape.type && "bg-accent",
            )}
          >
            {shape.icon}
            {shape.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function CanvasToolbar({
  tool,
  onToolChange,
  strokeColor,
  onStrokeColorChange,
  strokeWidth,
  onStrokeWidthChange,
  fontSize,
  onFontSizeChange,
  shapeType,
  onShapeTypeChange,
  onClear,
  onCopyToClipboard,
  onAddImage,
  showCopySuccess,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onZoomToFit,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  hasStylableSelection,
  hasWidthSupport,
  selectedColor,
  selectedWidth,
  isSpacePressed,
  tabId,
}: CanvasToolbarProps) {
  // When select tool is active with a stylable selection, use selected element's values
  const isEditingSelection = tool === "select" && hasStylableSelection;
  const displayColor =
    isEditingSelection && selectedColor ? selectedColor : strokeColor;
  const displayWidth =
    isEditingSelection && selectedWidth ? selectedWidth : strokeWidth;

  // When space is pressed, show hand tool as active and selected tool as muted
  const isHandTemporarilyActive = isSpacePressed && tool !== "hand";
  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-elevated border-b min-h-[32px]">
      {/* Drawing tools */}
      <div className="flex items-center gap-0.5">
        <ToolButton
          active={tool === "pen" && !isHandTemporarilyActive}
          muted={tool === "pen" && isHandTemporarilyActive}
          onClick={() => onToolChange("pen")}
          icon={<Pen size={14} />}
          tooltip="Pen tool"
        />
        <ToolButton
          active={tool === "eraser" && !isHandTemporarilyActive}
          muted={tool === "eraser" && isHandTemporarilyActive}
          onClick={() => onToolChange("eraser")}
          icon={<Eraser size={14} />}
          tooltip="Eraser tool"
        />
        <ToolButton
          active={tool === "text" && !isHandTemporarilyActive}
          muted={tool === "text" && isHandTemporarilyActive}
          onClick={() => onToolChange("text")}
          icon={<Type size={14} />}
          tooltip="Text tool"
        />
        <ShapePicker
          active={tool === "shape" && !isHandTemporarilyActive}
          muted={tool === "shape" && isHandTemporarilyActive}
          shapeType={shapeType}
          onToolChange={onToolChange}
          onShapeTypeChange={onShapeTypeChange}
        />
      </div>

      <Separator
        orientation="vertical"
        className="h-4 mx-1 bg-elevated-border"
      />

      {/* Selection & navigation tools */}
      <div className="flex items-center gap-0.5">
        <ToolButton
          active={tool === "select" && !isHandTemporarilyActive}
          muted={tool === "select" && isHandTemporarilyActive}
          onClick={() => onToolChange("select")}
          icon={<MousePointer2 size={14} />}
          tooltip="Select tool"
        />
        <ToolButton
          active={tool === "hand" || isHandTemporarilyActive}
          onClick={() => onToolChange("hand")}
          icon={<Hand size={14} />}
          tooltip="Hand tool (pan)"
        />
      </div>

      <Separator
        orientation="vertical"
        className="h-4 mx-1 bg-elevated-border"
      />

      {/* Undo/Redo buttons */}
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className={cn(
                "p-1 rounded transition-colors shrink-0",
                canUndo
                  ? "hover:bg-foreground/10"
                  : "opacity-40 cursor-not-allowed",
              )}
            >
              <Undo2 size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className={cn(
                "p-1 rounded transition-colors shrink-0",
                canRedo
                  ? "hover:bg-foreground/10"
                  : "opacity-40 cursor-not-allowed",
              )}
            >
              <Redo2 size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
        </Tooltip>
      </div>

      <Separator
        orientation="vertical"
        className="h-4 mx-1 bg-elevated-border"
      />

      {/* Color and size controls - grouped with tighter spacing */}
      <div className="flex items-center gap-0.5">
        <ColorPicker
          color={displayColor}
          onColorChange={onStrokeColorChange}
          disabled={
            tool === "eraser" ||
            tool === "hand" ||
            (tool === "select" && !hasStylableSelection)
          }
        />
        <SizeSelector
          key={tool === "text" ? "text-size" : "stroke-size"}
          size={tool === "text" ? fontSize : displayWidth}
          sizes={tool === "text" ? FONT_SIZES : STROKE_WIDTHS}
          onSizeChange={
            tool === "text" ? onFontSizeChange : onStrokeWidthChange
          }
          label={tool === "text" ? "Font" : "Size"}
          disabled={tool === "hand" || (tool === "select" && !hasWidthSupport)}
        />
      </div>

      <div className="flex-1" />

      {/* Zoom controls */}
      <ZoomControls
        zoom={zoom}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onResetZoom={onResetZoom}
        onZoomToFit={onZoomToFit}
      />

      <Separator
        orientation="vertical"
        className="h-4 mx-1 bg-elevated-border"
      />

      {/* Actions menu */}
      <ActionsMenu
        onCopyToClipboard={onCopyToClipboard}
        onAddImage={onAddImage}
        onClear={onClear}
        showCopySuccess={showCopySuccess}
        tabId={tabId}
      />
    </div>
  );
}
