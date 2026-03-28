/**
 * Inline action buttons for git operations (stage/unstage/revert).
 *
 * Used in file and folder items to provide quick access to common operations.
 * Visible on hover via parent's group-hover class.
 */

import { Plus, Minus, RotateCcw } from "lucide-react";

export interface ActionButtonsProps {
  /** Whether the item is staged */
  isStaged: boolean;
  /** Whether the item can be reverted (false for untracked files) */
  canRevert: boolean;
  /** Callback to stage the item */
  onStage?: () => void;
  /** Callback to unstage the item */
  onUnstage?: () => void;
  /** Callback to revert/discard changes */
  onRevert?: () => void;
  /** Title prefix for tooltips (e.g., "Stage" vs "Stage folder") */
  itemType?: "file" | "folder";
}

/**
 * Shared button component with consistent styling and keyboard support.
 */
function ActionButton({
  onClick,
  title,
  testId,
  children,
}: {
  onClick: () => void;
  title: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }
      }}
      className="p-1 rounded hover:bg-foreground/20 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 cursor-pointer"
      title={title}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

/**
 * Inline action buttons for stage/unstage/revert operations.
 * Renders different buttons based on staged state.
 *
 * Parent controls visibility via display:none/block on hover.
 */
export function ActionButtons({
  isStaged,
  canRevert,
  onStage,
  onUnstage,
  onRevert,
  itemType = "file",
}: ActionButtonsProps) {
  // Don't render if no actions available
  if (!onStage && !onUnstage && !onRevert) {
    return null;
  }

  const suffix = itemType === "folder" ? " folder" : "";

  return (
    <div className="flex-shrink-0 flex items-center gap-0.5">
      {isStaged ? (
        onUnstage && (
          <ActionButton
            onClick={onUnstage}
            title={`Unstage${suffix}`}
            testId="unstage-button"
          >
            <Minus size={12} />
          </ActionButton>
        )
      ) : (
        <>
          {onStage && (
            <ActionButton
              onClick={onStage}
              title={`Stage${suffix}`}
              testId="stage-button"
            >
              <Plus size={12} />
            </ActionButton>
          )}
          {canRevert && onRevert && (
            <ActionButton
              onClick={onRevert}
              title={`Discard${suffix} changes`}
              testId="revert-button"
            >
              <RotateCcw size={12} />
            </ActionButton>
          )}
        </>
      )}
    </div>
  );
}
