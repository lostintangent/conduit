/**
 * Pane Actions Editor Component
 *
 * Visual interface for discovering and editing pane actions.
 * Similar design to KeybindingsEditor.
 */

import { usePaneActions } from '@/paneActions';
import { ChevronDown, ChevronRight, Edit2, Eye, EyeOff, Search, X } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import type { Action } from '@/paneActions/core/types';

interface PaneActionsEditorProps {
  onClose: () => void;
  homeDirectory: string;
  onOpenQuickPane?: (descriptor: { type: 'editor'; cwd: string; filePath?: string }) => void;
}

export function PaneActionsEditor({
  onClose,
  homeDirectory,
  onOpenQuickPane
}: PaneActionsEditorProps) {
  const actions = usePaneActions();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());

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

  // Filter actions based on search
  const filteredActions = useMemo(() => {
    if (!searchQuery.trim()) {
      return actions;
    }

    const query = searchQuery.toLowerCase();
    return actions.filter(action => {
      const nameMatch = action.name.toLowerCase().includes(query);
      const typeMatch = action.paneType.toLowerCase().includes(query);
      const iconMatch = action.icon.toLowerCase().includes(query);
      return nameMatch || typeMatch || iconMatch;
    });
  }, [actions, searchQuery]);

  const handleToggleExpand = (actionName: string) => {
    const newExpanded = new Set(expandedActions);
    if (newExpanded.has(actionName)) {
      newExpanded.delete(actionName);
    } else {
      newExpanded.add(actionName);
    }
    setExpandedActions(newExpanded);
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

        {/* Search */}
        <div className="px-6 py-4 border-b border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search actions (e.g., 'Source Control', 'terminal', 'git')..."
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>
        </div>

        {/* Actions list */}
        <div className="flex-1 overflow-y-auto">
          <div className="divide-y divide-gray-800">
            {filteredActions.map((action, index) => {
              const isExpanded = expandedActions.has(action.name);

              return (
                <div
                  key={index}
                  className="px-6 py-4 hover:bg-gray-800/50 transition-colors"
                >
                  {/* Action header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
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

                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white font-medium">
                          {action.name}
                        </span>
                        {action.enabled ? (
                          <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            Enabled
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-gray-500/20 text-gray-400 text-xs rounded flex items-center gap-1">
                            <EyeOff className="w-3 h-3" />
                            Disabled
                          </span>
                        )}
                        <span className={`px-1.5 py-0.5 text-xs rounded ${getPaneTypeColor(action.paneType)}`}>
                          {action.paneType}
                        </span>
                        <span className="text-xs text-gray-500">
                          {action.icon}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="p-1.5 hover:bg-white/10 rounded transition-colors"
                        title="Edit action"
                        onClick={handleOpenConfigFile}
                      >
                        <Edit2 className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-4 pl-9 space-y-3">
                      {/* Default config */}
                      <div>
                        <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                          Default Configuration
                        </h4>
                        <div className="bg-gray-800/50 rounded-lg p-3">
                          {renderConfig(action.config, action.paneType)}
                        </div>
                      </div>

                      {/* Overrides */}
                      {action.overrides && action.overrides.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                            Path Overrides ({action.overrides.length})
                          </h4>
                          <div className="space-y-2">
                            {action.overrides.map((override, overrideIndex) => (
                              <div
                                key={overrideIndex}
                                className="bg-gray-800/50 rounded-lg p-3"
                              >
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-xs font-medium text-blue-400">Path:</span>
                                  <code className="text-xs text-gray-300 font-mono">{override.path}</code>
                                  {override.paneType && (
                                    <span className={`px-1.5 py-0.5 text-xs rounded ${getPaneTypeColor(override.paneType)}`}>
                                      → {override.paneType}
                                    </span>
                                  )}
                                </div>
                                {renderConfig(override.config, override.paneType || action.paneType)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {filteredActions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <Search className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm">No actions found matching your search</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-800/50">
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
            See{' '}
            <a
              href="https://docs.example.com/pane-actions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-blue-400 transition-colors underline decoration-dotted underline-offset-2"
            >
              documentation
            </a>{' '}
            for schema and examples.
          </p>
        </div>
      </div>
    </div>
  );
}
