/**
 * Pane Actions Editor Component
 *
 * Visual interface for discovering and editing pane actions.
 * Similar design to KeybindingsEditor.
 */

import { usePaneActions, savePaneActions, resetPaneActionsToDefaults, hasUserPaneActionsFile } from '@/paneActions';
import type { Action } from '@/paneActions/core/types';
import {
  Book,
  Bot,
  Bug,
  Check,
  ChevronDown,
  ChevronRight,
  Code,
  Container,
  Database,
  Edit2,
  // Pane action icons from schema
  GitBranch,
  Globe,
  GripVertical,
  HelpCircle,
  Package,
  Rocket,
  Server,
  Shield,
  Terminal,
  TestTube,
  Wrench,
  X,
  type LucideIcon
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface PaneActionsEditorProps {
  onClose: () => void;
  homeDirectory: string;
  onOpenQuickPane?: (descriptor: { type: 'editor'; cwd: string; filePath?: string }) => void;
}

// Icon mapping based on docs/pane-actions-schema.md
const ICON_MAP: Record<string, LucideIcon> = {
  'git-branch': GitBranch,
  'code': Code,
  'terminal': Terminal,
  'globe': Globe,
  'bot': Bot,
  'container': Container,
  'database': Database,
  'package': Package,
  'server': Server,
  'test-tube': TestTube,
  'bug': Bug,
  'rocket': Rocket,
  'shield': Shield,
  'book': Book,
  'wrench': Wrench,
};

// Component to render pane action icon
function ActionIcon({ iconId, className = "w-4 h-4" }: { iconId: string; className?: string }) {
  const IconComponent = ICON_MAP[iconId] || HelpCircle;
  return <IconComponent className={className} />;
}

export function PaneActionsEditor({
  onClose,
  homeDirectory,
  onOpenQuickPane
}: PaneActionsEditorProps) {
  const actions = usePaneActions();
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());
  const [editingActionIndex, setEditingActionIndex] = useState<number | null>(null);
  const [editedAction, setEditedAction] = useState<Action | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [reorderedActions, setReorderedActions] = useState<Action[]>(actions);
  const [hasUserConfig, setHasUserConfig] = useState<boolean>(false);

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

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleToggleExpand = (actionName: string) => {
    const newExpanded = new Set(expandedActions);
    if (newExpanded.has(actionName)) {
      newExpanded.delete(actionName);
    } else {
      newExpanded.add(actionName);
    }
    setExpandedActions(newExpanded);
  };

  const handleEditAction = (index: number) => {
    // Enter edit mode for this action
    const action = reorderedActions[index];
    setEditedAction(JSON.parse(JSON.stringify(action))); // Deep copy
    setEditingActionIndex(index);

    // Auto-expand the action
    const newExpanded = new Set(expandedActions);
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
    } catch (error) {
      console.error('Failed to save pane actions:', error);
      alert('Failed to save changes: ' + (error as Error).message);
    }
  };

  const handleOpenConfigFile = () => {
    if (!onOpenQuickPane) return;

    const configPath = `${homeDirectory}/.conduit/paneactions.json`;
    onOpenQuickPane({
      type: 'editor',
      cwd: homeDirectory,
      filePath: configPath,
    });
    onClose();
  };

  const handleResetToDefaults = async () => {
    if (!confirm('Reset to default pane actions? This will delete your custom configuration.')) {
      return;
    }

    try {
      // Delete file and update atom with defaults
      await resetPaneActionsToDefaults(homeDirectory);

      // Update hasUserConfig state
      setHasUserConfig(false);
    } catch (error) {
      console.error('Failed to reset to defaults:', error);
      alert('Failed to reset to defaults: ' + (error as Error).message);
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
      console.error('Failed to save reordered actions:', error);
      alert('Failed to save reordered actions: ' + (error as Error).message);
    }
  };

  const getPaneTypeColor = (paneType: string) => {
    switch (paneType) {
      case 'terminal':
        return 'text-green-400 bg-green-500/20';
      case 'editor':
        return 'text-blue-400 bg-blue-500/20';
      case 'browser':
        return 'text-purple-400 bg-purple-500/20';
      default:
        return 'text-gray-400 bg-gray-500/20';
    }
  };

  const renderConfig = (config: any, paneType: string) => {
    if (paneType === 'terminal') {
      return (
        <div className="space-y-1">
          <div className="flex items-start gap-2">
            <span className="text-xs text-gray-500 w-20">Command:</span>
            <code className="text-xs text-gray-300 font-mono flex-1">{config.command || '(empty)'}</code>
          </div>
          {config.cwd && (
            <div className="flex items-start gap-2">
              <span className="text-xs text-gray-500 w-20">CWD:</span>
              <code className="text-xs text-gray-300 font-mono flex-1">{config.cwd}</code>
            </div>
          )}
          {config.env && Object.keys(config.env).length > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-xs text-gray-500 w-20">Env:</span>
              <code className="text-xs text-gray-300 font-mono flex-1">
                {JSON.stringify(config.env, null, 2)}
              </code>
            </div>
          )}
          {config.clear && (
            <div className="flex items-start gap-2">
              <span className="text-xs text-gray-500 w-20">Clear:</span>
              <code className="text-xs text-gray-300 font-mono flex-1">true</code>
            </div>
          )}
        </div>
      );
    } else if (paneType === 'editor') {
      return (
        <div className="space-y-1">
          {config.path && (
            <div className="flex items-start gap-2">
              <span className="text-xs text-gray-500 w-20">Path:</span>
              <code className="text-xs text-gray-300 font-mono flex-1">{config.path}</code>
            </div>
          )}
          {config.filePattern && (
            <div className="flex items-start gap-2">
              <span className="text-xs text-gray-500 w-20">Pattern:</span>
              <code className="text-xs text-gray-300 font-mono flex-1">{config.filePattern}</code>
            </div>
          )}
          {config.lineNumber && (
            <div className="flex items-start gap-2">
              <span className="text-xs text-gray-500 w-20">Line:</span>
              <code className="text-xs text-gray-300 font-mono flex-1">{config.lineNumber}</code>
            </div>
          )}
          {Object.keys(config).length === 0 && (
            <span className="text-xs text-gray-500 italic">No configuration</span>
          )}
        </div>
      );
    } else if (paneType === 'browser') {
      return (
        <div className="space-y-1">
          <div className="flex items-start gap-2">
            <span className="text-xs text-gray-500 w-20">URL:</span>
            <code className="text-xs text-gray-300 font-mono flex-1">{config.url}</code>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[90vw] h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Pane Actions</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Actions list */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full border-gray-800">
            <thead className="sticky top-0 bg-gray-800 border-b border-gray-700">
              <tr>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-0">
                  {/* Drag handle column */}
                </th>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-0">
                  {/* Expand button column */}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Configuration
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider w-24">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 border-gray-800">
              {reorderedActions.map((action, index) => {
                const isExpanded = expandedActions.has(action.name);

                return (
                  <>
                    {/* Main action row */}
                    <tr
                      key={index}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`hover:bg-gray-800/50 transition-colors ${!action.enabled ? 'opacity-40' : ''} ${draggedIndex === index ? 'opacity-50' : ''} ${isExpanded ? 'border-b-0' : ''}`}
                    >
                      {/* Drag handle */}
                      <td className="px-2 py-2">
                        <button
                          className="p-1 cursor-grab active:cursor-grabbing hover:bg-white/10 rounded transition-colors"
                          onMouseDown={(e) => e.stopPropagation()}
                          title="Drag to reorder"
                        >
                          <GripVertical className="w-4 h-4 text-gray-400" />
                        </button>
                      </td>

                      {/* Expand button */}
                      <td className="px-2 py-2">
                        <button
                          onClick={() => handleToggleExpand(action.name)}
                          className="p-1 hover:bg-white/10 rounded transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </td>

                      {/* Action column */}
                      <td className="px-6 py-2">
                        <div className="flex items-center gap-3">
                          <ActionIcon iconId={action.icon} className="w-5 h-5 text-gray-300 flex-shrink-0" />
                          <span className="text-sm text-white font-medium whitespace-nowrap">
                            {action.name}
                          </span>
                          <span className={`px-1.5 py-0.5 text-xs rounded whitespace-nowrap ${getPaneTypeColor(action.paneType)}`}>
                            {action.paneType}
                          </span>
                        </div>
                      </td>

                      {/* Command column */}
                      <td className="px-6 py-2">
                        <div className="text-sm text-gray-400 font-mono truncate max-w-md">
                          {action.paneType === 'terminal' && (action.config as any).command && (
                            <span>{(action.config as any).command}</span>
                          )}
                          {action.paneType === 'browser' && (action.config as any).url && (
                            <span>{(action.config as any).url}</span>
                          )}
                          {action.paneType === 'editor' && (
                            <span className="text-gray-500 italic">No config</span>
                          )}
                        </div>
                      </td>

                      {/* Actions column */}
                      <td className="px-6 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {editingActionIndex === index ? (
                            <>
                              <button
                                className="p-1.5 hover:bg-white/10 rounded transition-colors text-green-400"
                                title="Save changes"
                                onClick={handleSaveAction}
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                className="p-1.5 hover:bg-white/10 rounded transition-colors text-red-400"
                                title="Cancel"
                                onClick={handleCancelEdit}
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <button
                              className="p-1.5 hover:bg-white/10 rounded transition-colors"
                              title="Edit action"
                              onClick={() => handleEditAction(index)}
                            >
                              <Edit2 className="w-4 h-4 text-gray-400" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded details row */}
                    {isExpanded && (
                      <tr className={`border-t-0 ${!action.enabled && editingActionIndex !== index ? 'opacity-40' : ''}`}>
                        <td colSpan={5} className={`px-6 py-4 ${action.enabled ? 'bg-gray-800/30' : ''}`}>
                          {editingActionIndex === index && editedAction ? (
                            <div className="pl-9 space-y-4 border-l-2 border-blue-500/50">
                              {/* Action Properties */}
                              <div className="bg-gray-800/30 rounded-lg p-4 space-y-3">
                                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                                  Action Properties
                                </h4>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-xs text-gray-400 block mb-1">Name</label>
                                    <input
                                      type="text"
                                      value={editedAction.name}
                                      onChange={(e) => setEditedAction({ ...editedAction, name: e.target.value })}
                                      className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-400 block mb-1">Icon (lucide-react)</label>
                                    <input
                                      type="text"
                                      value={editedAction.icon}
                                      onChange={(e) => setEditedAction({ ...editedAction, icon: e.target.value })}
                                      className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                                      placeholder="e.g., git-branch"
                                    />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-xs text-gray-400 block mb-1">Enabled</label>
                                    <label className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={editedAction.enabled}
                                        onChange={(e) => setEditedAction({ ...editedAction, enabled: e.target.checked })}
                                        className="w-4 h-4 bg-gray-900 border border-gray-700 rounded"
                                      />
                                      <span className="text-sm text-gray-300">Show in UI</span>
                                    </label>
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-400 block mb-1">Pane Type</label>
                                    <select
                                      value={editedAction.paneType}
                                      onChange={(e) => setEditedAction({ ...editedAction, paneType: e.target.value as any })}
                                      className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                                    >
                                      <option value="terminal">terminal</option>
                                      <option value="editor">editor</option>
                                      <option value="browser">browser</option>
                                    </select>
                                  </div>
                                </div>
                              </div>

                              {/* Configuration (Edit Mode) */}
                              <div>
                                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                                  Configuration
                                </h4>
                                <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                                  {editedAction.paneType === 'terminal' && (
                                    <>
                                      <div>
                                        <label className="text-xs text-gray-400 block mb-1">Command</label>
                                        <input
                                          type="text"
                                          value={(editedAction.config as any).command || ''}
                                          onChange={(e) => setEditedAction({
                                            ...editedAction,
                                            config: { ...(editedAction.config as any), command: e.target.value }
                                          })}
                                          className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                                          placeholder="e.g., git status"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-xs text-gray-400 block mb-1">Working Directory (optional)</label>
                                        <input
                                          type="text"
                                          value={(editedAction.config as any).cwd || ''}
                                          onChange={(e) => setEditedAction({
                                            ...editedAction,
                                            config: { ...(editedAction.config as any), cwd: e.target.value || undefined }
                                          })}
                                          className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                                          placeholder="e.g., ~/Projects"
                                        />
                                      </div>
                                    </>
                                  )}
                                  {editedAction.paneType === 'editor' && (
                                    <div className="text-xs text-gray-500 italic">
                                      Editor panes don't support configuration options yet. The editor will use the current working directory from the override path.
                                    </div>
                                  )}
                                  {editedAction.paneType === 'browser' && (
                                    <div>
                                      <label className="text-xs text-gray-400 block mb-1">URL</label>
                                      <input
                                        type="text"
                                        value={(editedAction.config as any).url || ''}
                                        onChange={(e) => setEditedAction({
                                          ...editedAction,
                                          config: { ...(editedAction.config as any), url: e.target.value }
                                        })}
                                        className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white font-mono focus:outline-none focus:border-blue-500"
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
                                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                                  Configuration
                                </h4>
                                <div className="bg-gray-800/50 rounded-lg p-3">
                                  {renderConfig(action.config, action.paneType)}
                                </div>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-800/50">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-gray-500">
              Pane actions can be customized by editing{' '}
              <button
                onClick={handleOpenConfigFile}
                className="text-gray-400 hover:text-blue-400 transition-colors cursor-pointer underline decoration-dotted underline-offset-2"
                disabled={!onOpenQuickPane}
                title={onOpenQuickPane ? 'Click to open file in editor' : undefined}
              >
                <code>~/.conduit/paneactions.json</code>
              </button>
              {'. '}
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
      </div>
    </div>
  );
}
