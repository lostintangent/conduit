/**
 * Pane Actions Editor Component
 *
 * Visual interface for discovering and editing pane actions.
 * Similar design to KeybindingsEditor.
 */

import {
  getAvailableIconIds,
  hasUserPaneActionsFile,
  isBrowserConfig,
  isEditorConfig,
  isTerminalConfig,
  PaneActionIcon,
  resetPaneActionsToDefaults,
  savePaneActions,
  usePaneActions,
} from "@/commands/paneActions";
import type {
  Action,
  BrowserConfig,
  EditorConfig,
  PaneType,
  TerminalConfig,
} from "@/commands/paneActions/core/types";
import { MAX_ACTIONS } from "@/commands/paneActions/core/types";
import { usePreCommands } from "@/commands/preCommands";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Edit2,
  GripVertical,
  Info,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import React, { useEffect, useState } from "react";

const api = window.conduit;

interface PaneActionsEditorContentProps {
  homeDirectory: string;
  onOpenQuickPane?: (descriptor: {
    type: "editor";
    cwd: string;
    filePath?: string;
  }) => void;
}

// Available icon IDs for dropdown
const AVAILABLE_ICONS = getAvailableIconIds();

export function PaneActionsEditorContent({
  homeDirectory,
  onOpenQuickPane,
}: PaneActionsEditorContentProps) {
  const actions = usePaneActions();
  const preCommands = usePreCommands();
  const [expandedActions, setExpandedActions] = useState<Set<string>>(
    new Set(),
  );

  const [editingActionIndex, setEditingActionIndex] = useState<number | null>(
    null,
  );
  const [editedAction, setEditedAction] = useState<Action | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [reorderedActions, setReorderedActions] = useState<Action[]>(actions);
  const [hasUserConfig, setHasUserConfig] = useState<boolean>(false);
  const [iconDropdownOpen, setIconDropdownOpen] = useState<boolean>(false);

  // Sync reorderedActions when actions change (from external file updates)
  useEffect(() => {
    setReorderedActions(actions);
  }, [actions]);

  // Check if user config file exists
  useEffect(() => {
    async function checkUserConfig() {
      const exists = await hasUserPaneActionsFile(homeDirectory);
      setHasUserConfig(exists);
    }

    checkUserConfig();
  }, [homeDirectory]); // Only check on mount and when homeDirectory changes

  const hasUnsavedChanges = () => {
    if (editedAction === null || editingActionIndex === null) {
      return false;
    }

    const originalAction = reorderedActions[editingActionIndex];
    return JSON.stringify(editedAction) !== JSON.stringify(originalAction);
  };

  const handleToggleExpand = (actionName: string) => {
    const newExpanded = new Set(expandedActions);
    const isCurrentlyExpanded = newExpanded.has(actionName);

    // If collapsing and this action is being edited with unsaved changes, confirm
    if (isCurrentlyExpanded && editingActionIndex !== null) {
      const editingAction = reorderedActions[editingActionIndex];
      if (editingAction.name === actionName && hasUnsavedChanges()) {
        const shouldDiscard = confirm(
          "You have unsaved changes. Are you sure you want to discard them?",
        );
        if (!shouldDiscard) {
          return;
        }
        // Exit edit mode
        setEditingActionIndex(null);
        setEditedAction(null);
      }
    }

    if (isCurrentlyExpanded) {
      newExpanded.delete(actionName);
    } else {
      newExpanded.add(actionName);
    }
    setExpandedActions(newExpanded);
  };

  const handleEditAction = (index: number) => {
    // Check if there are unsaved changes
    if (hasUnsavedChanges()) {
      const shouldDiscard = confirm(
        "You have unsaved changes. Are you sure you want to discard them?",
      );
      if (!shouldDiscard) {
        return;
      }
    }

    // Close icon dropdown when switching actions
    setIconDropdownOpen(false);

    // Prepare the new expanded state
    const newExpanded = new Set(expandedActions);

    // Collapse the previous action's expanded section if switching from one edit to another
    if (editingActionIndex !== null) {
      const previousAction = reorderedActions[editingActionIndex];
      newExpanded.delete(previousAction.name);
    }

    // Enter edit mode for this action
    const action = reorderedActions[index];
    setEditedAction(JSON.parse(JSON.stringify(action))); // Deep copy
    setEditingActionIndex(index);

    // Auto-expand the new action
    newExpanded.add(action.name);
    setExpandedActions(newExpanded);
  };

  const handleCancelEdit = () => {
    // Collapse the expanded section
    if (editingActionIndex !== null) {
      const action = reorderedActions[editingActionIndex];
      const newExpanded = new Set(expandedActions);
      newExpanded.delete(action.name);
      setExpandedActions(newExpanded);
    }

    setEditingActionIndex(null);
    setEditedAction(null);
    setIconDropdownOpen(false);
  };

  const handleSaveAction = async () => {
    if (editedAction === null || editingActionIndex === null) return;

    try {
      // Create updated actions array
      const updatedActions = [...reorderedActions];
      updatedActions[editingActionIndex] = editedAction;

      // Save to file and update atom
      await savePaneActions(updatedActions, homeDirectory);

      // Update hasUserConfig state
      setHasUserConfig(true);

      // Collapse the expanded section
      const newExpanded = new Set(expandedActions);
      newExpanded.delete(editedAction.name);
      setExpandedActions(newExpanded);

      // Exit edit mode
      setEditingActionIndex(null);
      setEditedAction(null);
      setIconDropdownOpen(false);
    } catch (error) {
      console.error("Failed to save pane actions:", error);
      alert("Failed to save changes: " + (error as Error).message);
    }
  };

  const handleDeleteAction = async (index: number) => {
    const action = reorderedActions[index];

    // Confirm deletion
    const shouldDelete = confirm(
      `Are you sure you want to delete the "${action.name}" action?`,
    );
    if (!shouldDelete) {
      return;
    }

    // Check if this would leave us with 0 actions
    if (reorderedActions.length === 1) {
      alert("Cannot delete the last action. At least one action is required.");
      return;
    }

    try {
      // Create updated actions array without this action
      const updatedActions = reorderedActions.filter((_, i) => i !== index);

      // Save to file and update atom
      await savePaneActions(updatedActions, homeDirectory);

      // Update hasUserConfig state
      setHasUserConfig(true);

      // Clear editing state if we were editing this action
      if (editingActionIndex === index) {
        setEditingActionIndex(null);
        setEditedAction(null);
      } else if (editingActionIndex !== null && editingActionIndex > index) {
        // Adjust editing index if we deleted an action before it
        setEditingActionIndex(editingActionIndex - 1);
      }

      // Remove from expanded set
      const newExpanded = new Set(expandedActions);
      newExpanded.delete(action.name);
      setExpandedActions(newExpanded);
    } catch (error) {
      console.error("Failed to delete pane action:", error);
      alert("Failed to delete action: " + (error as Error).message);
    }
  };

  const handleAddAction = async () => {
    // Create a new default action
    const newAction: Action = {
      name: "New Action",
      icon: "package",
      enabled: true,
      paneType: "terminal",
      config: {
        command: 'echo "Hello World"',
      },
    };

    try {
      // Create updated actions array with new action
      const updatedActions = [...reorderedActions, newAction];

      // Save to file and update atom
      await savePaneActions(updatedActions, homeDirectory);

      // Update hasUserConfig state
      setHasUserConfig(true);

      // Enter edit mode for the new action
      const newIndex = updatedActions.length - 1;
      setEditedAction(JSON.parse(JSON.stringify(newAction)));
      setEditingActionIndex(newIndex);

      // Auto-expand the new action
      const newExpanded = new Set(expandedActions);
      newExpanded.add(newAction.name);
      setExpandedActions(newExpanded);
    } catch (error) {
      console.error("Failed to add pane action:", error);
      alert("Failed to add action: " + (error as Error).message);
    }
  };

  const handleOpenConfigFile = () => {
    if (!onOpenQuickPane) return;

    const configPath = `${homeDirectory}/.conduit/paneactions.json`;
    onOpenQuickPane({
      type: "editor",
      cwd: homeDirectory,
      filePath: configPath,
    });
    onClose();
  };

  const handleResetToDefaults = async () => {
    if (
      !confirm(
        "Reset to default pane actions? This will delete your custom configuration.",
      )
    ) {
      return;
    }

    try {
      // Delete file and update atom with defaults
      await resetPaneActionsToDefaults(homeDirectory);

      // Update hasUserConfig state
      setHasUserConfig(false);
    } catch (error) {
      console.error("Failed to reset to defaults:", error);
      alert("Failed to reset to defaults: " + (error as Error).message);
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    // Reorder the actions array
    const newActions = [...reorderedActions];
    const draggedAction = newActions[draggedIndex];
    newActions.splice(draggedIndex, 1);
    newActions.splice(index, 0, draggedAction);

    setReorderedActions(newActions);
    setDraggedIndex(index);
  };

  const handleDragEnd = async () => {
    if (draggedIndex === null) return;
    setDraggedIndex(null);

    // Auto-save the new order
    try {
      await savePaneActions(reorderedActions, homeDirectory);

      // Update hasUserConfig state
      setHasUserConfig(true);
    } catch (error) {
      console.error("Failed to save reordered actions:", error);
      alert("Failed to save reordered actions: " + (error as Error).message);
    }
  };

  const getPaneTypeColor = (paneType: string) => {
    switch (paneType) {
      case "terminal":
        return "text-green-400 bg-green-500/20";
      case "editor":
        return "text-blue-400 bg-blue-500/20";
      case "browser":
        return "text-purple-400 bg-purple-500/20";
      default:
        return "text-tinted-foreground/60 bg-tinted-foreground/20";
    }
  };

  const renderConfig = (config: any, paneType: string) => {
    if (paneType === "terminal") {
      return (
        <div className="space-y-1">
          <div className="flex items-start gap-2">
            <span className="text-xs text-tinted-foreground/50 w-20">
              Command:
            </span>
            <code className="text-xs text-tinted-foreground/80 font-mono flex-1">
              {config.command || "(empty)"}
            </code>
          </div>
          {config.cwd && (
            <div className="flex items-start gap-2">
              <span className="text-xs text-tinted-foreground/50 w-20">
                CWD:
              </span>
              <code className="text-xs text-tinted-foreground/80 font-mono flex-1">
                {config.cwd}
              </code>
            </div>
          )}
          {config.preCommandId &&
            (() => {
              const preCommand = preCommands.find(
                (pc) => pc.id === config.preCommandId,
              );
              return (
                <div className="flex items-start gap-2">
                  <span className="text-xs text-tinted-foreground/50 w-20">
                    Pre-Command:
                  </span>
                  <span className="text-xs text-tinted-foreground/80 flex-1">
                    {preCommand ? preCommand.label : config.preCommandId}
                  </span>
                </div>
              );
            })()}
        </div>
      );
    } else if (paneType === "editor") {
      return (
        <div className="space-y-1">
          {config.cwd && (
            <div className="flex items-start gap-2">
              <span className="text-xs text-tinted-foreground/50 w-20">
                CWD:
              </span>
              <code className="text-xs text-tinted-foreground/80 font-mono flex-1">
                {config.cwd}
              </code>
            </div>
          )}
          {Object.keys(config).length === 0 && (
            <span className="text-xs text-tinted-foreground/50 italic">
              No configuration
            </span>
          )}
        </div>
      );
    } else if (paneType === "browser") {
      return (
        <div className="space-y-1">
          <div className="flex items-start gap-2">
            <span className="text-xs text-tinted-foreground/50 w-20">URL:</span>
            <code className="text-xs text-tinted-foreground/80 font-mono flex-1">
              {config.url}
            </code>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <>
      {/* Actions list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <table className="w-full border-tinted-border/50">
          <thead className="sticky top-0 bg-tinted-muted border-b border-tinted-border">
            <tr>
              <th className="px-2 py-3 text-left text-xs font-medium text-tinted-foreground/60 uppercase tracking-wider w-0">
                {/* Drag handle column */}
              </th>
              <th className="px-2 py-3 text-left text-xs font-medium text-tinted-foreground/60 uppercase tracking-wider w-0">
                {/* Expand button column */}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-tinted-foreground/60 uppercase tracking-wider">
                Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-tinted-foreground/60 uppercase tracking-wider">
                Configuration
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-tinted-foreground/60 uppercase tracking-wider w-24">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tinted-border/50 border-tinted-border/50">
            {reorderedActions.map((action, index) => {
              const isExpanded = expandedActions.has(action.name);

              return (
                <React.Fragment key={index}>
                  {/* Main action row */}
                  <tr
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`hover:bg-tinted-muted/50 transition-colors ${!action.enabled ? "opacity-40" : ""} ${draggedIndex === index ? "opacity-50" : ""} ${isExpanded ? "border-b-0" : ""}`}
                  >
                    {/* Drag handle */}
                    <td className="px-2 py-2">
                      <button
                        className="p-1 cursor-grab active:cursor-grabbing hover:bg-tinted-foreground/10 rounded transition-colors"
                        onMouseDown={(e) => e.stopPropagation()}
                        title="Drag to reorder"
                      >
                        <GripVertical className="w-4 h-4 text-tinted-foreground/60" />
                      </button>
                    </td>

                    {/* Expand button */}
                    <td className="px-2 py-2">
                      <button
                        onClick={() => handleToggleExpand(action.name)}
                        className="p-1 hover:bg-tinted-foreground/10 rounded transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-tinted-foreground/60" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-tinted-foreground/60" />
                        )}
                      </button>
                    </td>

                    {/* Action column */}
                    <td className="px-6 py-2">
                      <div className="flex items-center gap-3">
                        <PaneActionIcon
                          iconId={action.icon}
                          className="w-5 h-5 text-tinted-foreground/80 flex-shrink-0"
                        />
                        <span className="text-sm text-tinted-foreground font-medium whitespace-nowrap">
                          {action.name}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 text-xs rounded whitespace-nowrap ${getPaneTypeColor(action.paneType)}`}
                        >
                          {action.paneType}
                        </span>
                      </div>
                    </td>

                    {/* Command column */}
                    <td className="px-6 py-2">
                      <div className="text-sm text-tinted-foreground/60 font-mono truncate max-w-md">
                        {isTerminalConfig(action.config) &&
                          (action.config.command ? (
                            <span>{action.config.command}</span>
                          ) : (
                            <span className="text-tinted-foreground/50 italic">
                              No config
                            </span>
                          ))}
                        {isBrowserConfig(action.config) &&
                          (action.config.url ? (
                            <span>{action.config.url}</span>
                          ) : (
                            <span className="text-tinted-foreground/50 italic">
                              No config
                            </span>
                          ))}
                        {isEditorConfig(action.config) &&
                          (action.config.cwd ? (
                            <span>{action.config.cwd}</span>
                          ) : (
                            <span className="text-tinted-foreground/50 italic">
                              No config
                            </span>
                          ))}
                      </div>
                    </td>

                    {/* Actions column */}
                    <td className="px-6 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {editingActionIndex === index ? (
                          <>
                            <button
                              className="p-1.5 hover:bg-tinted-foreground/10 rounded transition-colors text-green-400"
                              title="Save changes"
                              onClick={handleSaveAction}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              className="p-1.5 hover:bg-tinted-foreground/10 rounded transition-colors text-red-400"
                              title="Cancel"
                              onClick={handleCancelEdit}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="p-1.5 hover:bg-tinted-foreground/10 rounded transition-colors"
                              title="Edit action"
                              onClick={() => handleEditAction(index)}
                            >
                              <Edit2 className="w-4 h-4 text-tinted-foreground/60" />
                            </button>
                            <button
                              className="p-1.5 hover:bg-tinted-foreground/10 rounded transition-colors text-red-400"
                              title="Delete action"
                              onClick={() => handleDeleteAction(index)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded details row */}
                  {isExpanded && (
                    <tr
                      className={`border-t-0 ${!action.enabled && editingActionIndex !== index ? "opacity-40" : ""}`}
                    >
                      <td
                        colSpan={5}
                        className={`px-6 py-4 ${action.enabled ? "bg-tinted-muted/30" : ""}`}
                      >
                        {editingActionIndex === index && editedAction ? (
                          <div className="pl-9 space-y-4 border-l-2 border-accent/50">
                            {/* Action Properties */}
                            <div className="bg-tinted-muted/30 rounded-lg p-4 space-y-3">
                              <h4 className="text-xs font-medium text-tinted-foreground/60 uppercase tracking-wider mb-3">
                                Action Properties
                              </h4>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs text-tinted-foreground/60 block mb-1">
                                    Name
                                  </label>
                                  <input
                                    type="text"
                                    value={editedAction.name}
                                    onChange={(e) =>
                                      setEditedAction({
                                        ...editedAction,
                                        name: e.target.value,
                                      })
                                    }
                                    className="w-full px-2 py-1 bg-tinted border border-tinted-border rounded text-sm text-tinted-foreground focus:outline-none focus:border-accent"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-tinted-foreground/60 block mb-1">
                                    Icon
                                  </label>
                                  <div className="relative">
                                    {/* Icon dropdown trigger */}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setIconDropdownOpen(!iconDropdownOpen)
                                      }
                                      className="w-full px-2 py-1 bg-tinted border border-tinted-border rounded text-sm text-tinted-foreground hover:border-accent focus:outline-none focus:border-accent text-left flex items-center gap-2"
                                    >
                                      <PaneActionIcon
                                        iconId={editedAction.icon}
                                        className="w-4 h-4 text-tinted-foreground/80"
                                      />
                                      <span className="flex-1">
                                        {editedAction.icon}
                                      </span>
                                      <ChevronDown
                                        className={`w-4 h-4 text-tinted-foreground/60 transition-transform ${iconDropdownOpen ? "rotate-180" : ""}`}
                                      />
                                    </button>

                                    {/* Icon dropdown menu */}
                                    {iconDropdownOpen && (
                                      <>
                                        {/* Backdrop to close dropdown */}
                                        <div
                                          className="fixed inset-0 z-40"
                                          onClick={() =>
                                            setIconDropdownOpen(false)
                                          }
                                        />
                                        {/* Dropdown menu */}
                                        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-tinted-muted border border-tinted-border rounded-lg shadow-xl p-1 max-h-32 overflow-y-auto">
                                          <div className="grid grid-cols-1 gap-0.5">
                                            {AVAILABLE_ICONS.map((iconId) => (
                                              <button
                                                key={iconId}
                                                type="button"
                                                onClick={() => {
                                                  setEditedAction({
                                                    ...editedAction,
                                                    icon: iconId,
                                                  });
                                                  setIconDropdownOpen(false);
                                                }}
                                                className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-tinted-foreground/10 transition-colors ${
                                                  editedAction.icon === iconId
                                                    ? "bg-tinted-muted text-tinted-foreground"
                                                    : "text-tinted-foreground/80"
                                                }`}
                                              >
                                                <PaneActionIcon
                                                  iconId={iconId}
                                                  className="w-4 h-4"
                                                />
                                                <span>{iconId}</span>
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs text-tinted-foreground/60 block mb-1">
                                    Enabled
                                  </label>
                                  <label className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={editedAction.enabled}
                                      onChange={(e) =>
                                        setEditedAction({
                                          ...editedAction,
                                          enabled: e.target.checked,
                                        })
                                      }
                                      className="w-4 h-4 bg-tinted border border-tinted-border rounded"
                                    />
                                    <span className="text-sm text-tinted-foreground/80">
                                      Show in UI
                                    </span>
                                  </label>
                                </div>
                                <div>
                                  <label className="text-xs text-tinted-foreground/60 block mb-1">
                                    Pane Type
                                  </label>
                                  <div className="relative">
                                    <select
                                      value={editedAction.paneType}
                                      onChange={(e) =>
                                        setEditedAction({
                                          ...editedAction,
                                          paneType: e.target.value as PaneType,
                                        })
                                      }
                                      className="w-full px-2 py-1 bg-tinted border border-tinted-border rounded text-sm text-tinted-foreground focus:outline-none focus:border-accent appearance-none pr-8"
                                    >
                                      <option value="terminal">terminal</option>
                                      <option value="editor">editor</option>
                                      <option value="browser">browser</option>
                                    </select>
                                    <ChevronDown className="w-4 h-4 text-tinted-foreground/60 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Configuration (Edit Mode) */}
                            <div>
                              <h4 className="text-xs font-medium text-tinted-foreground/60 uppercase tracking-wider mb-2">
                                Configuration
                              </h4>
                              <div className="bg-tinted-muted/50 rounded-lg p-3 space-y-2">
                                {editedAction.paneType === "terminal" &&
                                  isTerminalConfig(editedAction.config) && (
                                    <>
                                      <div>
                                        <label className="text-xs text-tinted-foreground/60 block mb-1">
                                          Command
                                        </label>
                                        <input
                                          type="text"
                                          value={
                                            editedAction.config.command || ""
                                          }
                                          onChange={(e) =>
                                            setEditedAction({
                                              ...editedAction,
                                              config: {
                                                ...editedAction.config,
                                                command: e.target.value,
                                              } as TerminalConfig,
                                            })
                                          }
                                          className="w-full px-2 py-1 bg-tinted border border-tinted-border rounded text-sm text-tinted-foreground font-mono focus:outline-none focus:border-accent"
                                          placeholder="e.g., git status"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-xs text-tinted-foreground/60 block mb-1">
                                          Working Directory (optional)
                                        </label>
                                        <input
                                          type="text"
                                          value={editedAction.config.cwd || ""}
                                          onChange={(e) =>
                                            setEditedAction({
                                              ...editedAction,
                                              config: {
                                                ...editedAction.config,
                                                cwd:
                                                  e.target.value || undefined,
                                              } as TerminalConfig,
                                            })
                                          }
                                          className="w-full px-2 py-1 bg-tinted border border-tinted-border rounded text-sm text-tinted-foreground font-mono focus:outline-none focus:border-accent"
                                          placeholder="e.g., ~/Projects"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-xs text-tinted-foreground/60 flex items-center gap-1 mb-1">
                                          Pre-Command (optional)
                                          <Info
                                            className="w-3 h-3 text-tinted-foreground/50"
                                            title="Run a command before creating the terminal (e.g., validate git repo, create worktree)"
                                          />
                                        </label>
                                        <div className="relative">
                                          <select
                                            value={
                                              editedAction.config
                                                .preCommandId || ""
                                            }
                                            onChange={(e) =>
                                              setEditedAction({
                                                ...editedAction,
                                                config: {
                                                  ...editedAction.config,
                                                  preCommandId:
                                                    e.target.value || undefined,
                                                } as TerminalConfig,
                                              })
                                            }
                                            className="w-full px-2 py-1 bg-tinted border border-tinted-border rounded text-sm text-tinted-foreground focus:outline-none focus:border-accent appearance-none pr-8"
                                          >
                                            <option value="">None</option>
                                            {preCommands.map((preCommand) => (
                                              <option
                                                key={preCommand.id}
                                                value={preCommand.id}
                                              >
                                                {preCommand.label}
                                              </option>
                                            ))}
                                          </select>
                                          <ChevronDown className="w-4 h-4 text-tinted-foreground/60 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        </div>
                                        {editedAction.config.preCommandId &&
                                          (() => {
                                            const selectedPreCommand =
                                              preCommands.find(
                                                (pc) =>
                                                  pc.id ===
                                                  editedAction.config
                                                    .preCommandId,
                                              );
                                            return selectedPreCommand?.description ? (
                                              <p className="mt-1 text-xs text-tinted-foreground/50 italic">
                                                {selectedPreCommand.description}
                                              </p>
                                            ) : null;
                                          })()}
                                      </div>
                                    </>
                                  )}
                                {editedAction.paneType === "editor" &&
                                  isEditorConfig(editedAction.config) && (
                                    <div>
                                      <label className="text-xs text-tinted-foreground/60 block mb-1">
                                        Working Directory (optional)
                                      </label>
                                      <input
                                        type="text"
                                        value={editedAction.config.cwd || ""}
                                        onChange={(e) =>
                                          setEditedAction({
                                            ...editedAction,
                                            config: {
                                              ...editedAction.config,
                                              cwd: e.target.value || undefined,
                                            } as EditorConfig,
                                          })
                                        }
                                        className="w-full px-2 py-1 bg-tinted border border-tinted-border rounded text-sm text-tinted-foreground font-mono focus:outline-none focus:border-accent"
                                        placeholder="e.g., ~/Projects"
                                      />
                                    </div>
                                  )}
                                {editedAction.paneType === "browser" &&
                                  isBrowserConfig(editedAction.config) && (
                                    <div>
                                      <label className="text-xs text-tinted-foreground/60 block mb-1">
                                        URL
                                      </label>
                                      <input
                                        type="text"
                                        value={editedAction.config.url || ""}
                                        onChange={(e) =>
                                          setEditedAction({
                                            ...editedAction,
                                            config: {
                                              ...editedAction.config,
                                              url: e.target.value,
                                            } as BrowserConfig,
                                          })
                                        }
                                        className="w-full px-2 py-1 bg-tinted border border-tinted-border rounded text-sm text-tinted-foreground font-mono focus:outline-none focus:border-accent"
                                        placeholder="e.g., https://github.com"
                                      />
                                    </div>
                                  )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="pl-9 space-y-3">
                            {/* Configuration */}
                            <div>
                              <h4 className="text-xs font-medium text-tinted-foreground/60 uppercase tracking-wider mb-2">
                                Configuration
                              </h4>
                              <div className="bg-tinted-muted/50 rounded-lg p-3">
                                {renderConfig(action.config, action.paneType)}
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {/* Ghost rows for remaining slots */}
            {Array.from({
              length: Math.max(0, MAX_ACTIONS - reorderedActions.length),
            }).map((_, ghostIndex) => {
              const slotNumber = reorderedActions.length + ghostIndex + 1;
              return (
                <tr
                  key={`ghost-${ghostIndex}`}
                  className="border-t border-dashed border-tinted-border hover:bg-tinted-muted/30 cursor-pointer transition-colors"
                  onClick={handleAddAction}
                >
                  <td className="px-2 py-3" colSpan={2}>
                    {/* Empty drag/expand columns */}
                  </td>
                  <td className="px-6 py-3" colSpan={2}>
                    <div className="flex items-center gap-3 text-tinted-foreground/50">
                      <Plus className="w-4 h-4" />
                      <span className="text-sm italic">
                        Add new action to slot {slotNumber}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-3">{/* Empty actions column */}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-tinted-border bg-tinted-muted/50 flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-tinted-foreground/50">
            Pane actions can be customized by editing{" "}
            <button
              onClick={handleOpenConfigFile}
              className="text-tinted-foreground/60 hover:text-accent transition-colors cursor-pointer underline decoration-dotted underline-offset-2"
              disabled={!onOpenQuickPane}
              title={
                onOpenQuickPane ? "Click to open file in editor" : undefined
              }
            >
              <code>~/.conduit/paneactions.json</code>
            </button>
            {". "}
          </p>
          {hasUserConfig && (
            <button
              onClick={handleResetToDefaults}
              className="px-3 py-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded transition-colors whitespace-nowrap"
              title="Delete custom configuration and restore defaults"
            >
              Reset to Defaults
            </button>
          )}
        </div>
      </div>
    </>
  );
}
