/**
 * Keybindings Editor Component
 *
 * Visual interface for discovering and editing keyboard shortcuts.
 * Similar to VS Code's Keyboard Shortcuts editor (Cmd+K Cmd+S).
 */

import { AlertTriangle, Check, Copy, Edit2, RotateCcw, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { keybindingsAtom } from '@/store/atoms';
import type { ICommandRegistry } from '../../commands/core/CommandRegistry';
import type { CommandDescriptor } from '../../commands/core/types';
import type { KeybindingRegistry } from '../../commands/keybindings/KeybindingRegistry';
import type { ResolvedKeybinding } from '../../commands/keybindings/types';
import { isUserKeybinding } from '../../commands/keybindings/types';
import { formatKeybindingForDisplay, detectKeybindingConflicts } from '../../commands/keybindings/utils';
import {
  getUserKeybindingsPath,
  saveUserKeybinding,
  removeUserKeybinding
} from '../../commands/keybindings/userKeybindings';
import { KeybindingRecorder } from './KeybindingRecorder';

interface KeybindingsEditorProps {
  onClose: () => void;
  commandRegistry: ICommandRegistry;
  keybindingRegistry: KeybindingRegistry;
  homeDirectory: string;
  onOpenQuickPane?: (descriptor: { type: 'editor'; cwd: string; filePath?: string }) => void;
}

interface KeybindingRow {
  command: CommandDescriptor;
  keybinding: ResolvedKeybinding | null;
  isUserOverride: boolean;
  hasConflict: boolean;
  conflictingCommands: string[];
}

export function KeybindingsEditor({
  onClose,
  commandRegistry,
  keybindingRegistry,
  homeDirectory,
  onOpenQuickPane
}: KeybindingsEditorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCommandId, setEditingCommandId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'user' | 'conflicts'>('all');
  const [copiedCommandId, setCopiedCommandId] = useState<string | null>(null);

  // Subscribe to keybindingsAtom for reactive updates when file changes
  const globalKeybindings = useAtomValue(keybindingsAtom);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editingCommandId) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, editingCommandId]);

  // Note: User keybindings are now loaded on app startup in useCommandSystem hook
  // File watching is also handled globally in useCommandSystem hook

  // Build rows with command + keybinding info
  const rows = useMemo<KeybindingRow[]>(() => {
    const commands = commandRegistry.getAllCommands();

    // Group keybindings by command
    const keybindingsByCommand = new Map<string, ResolvedKeybinding[]>();
    commands.forEach(cmd => {
      const bindings = keybindingRegistry.getKeybindingsForCommand(cmd.id);
      if (bindings.length > 0) {
        keybindingsByCommand.set(cmd.id, bindings);
      }
    });

    // Detect conflicts using centralized function
    const conflicts = detectKeybindingConflicts(keybindingsByCommand);

    return commands.map(command => {
      const bindings = keybindingsByCommand.get(command.id) || [];

      // Sort by weight (highest first) to get primary keybinding
      const sortedBindings = [...bindings].sort((a, b) => (b.weight || 0) - (a.weight || 0));
      const primaryKeybinding = sortedBindings[0] || null;

      // Check if this is a user override using centralized function
      const isUserOverride = primaryKeybinding ? isUserKeybinding(primaryKeybinding) : false;

      // Check for conflicts by looking up this binding's normalized key
      let hasConflict = false;
      let conflictingCommands: string[] = [];

      if (primaryKeybinding) {
        // Find which conflict entry (if any) includes this command
        for (const [, commandIds] of conflicts) {
          if (commandIds.includes(command.id)) {
            hasConflict = true;
            conflictingCommands = commandIds.filter(id => id !== command.id);
            break;
          }
        }
      }

      return {
        command,
        keybinding: primaryKeybinding,
        isUserOverride,
        hasConflict,
        conflictingCommands
      };
    });
  }, [commandRegistry, keybindingRegistry, globalKeybindings]);

  // Filter rows
  const filteredRows = useMemo(() => {
    let filtered = rows;

    // Apply filter mode
    if (filterMode === 'user') {
      filtered = filtered.filter(row => row.isUserOverride);
    } else if (filterMode === 'conflicts') {
      filtered = filtered.filter(row => row.hasConflict);
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(row => {
        const titleMatch = row.command.title.toLowerCase().includes(query);
        const categoryMatch = row.command.category?.toLowerCase().includes(query);
        const idMatch = row.command.id.toLowerCase().includes(query);
        const keybindingMatch = row.keybinding && formatKeybindingForDisplay(row.keybinding.chords).toLowerCase().includes(query);
        return titleMatch || categoryMatch || idMatch || keybindingMatch;
      });
    }

    return filtered;
  }, [rows, searchQuery, filterMode]);

  const handleSaveKeybinding = async (commandId: string, keybinding: string) => {
    try {
      const keybindingsPath = getUserKeybindingsPath(homeDirectory);
      await saveUserKeybinding(commandId, keybinding, keybindingsPath, keybindingRegistry);
      setEditingCommandId(null);
    } catch (error) {
      console.error('Failed to save keybinding:', error);
    }
  };

  const handleCopyCommandId = async (commandId: string) => {
    try {
      await navigator.clipboard.writeText(commandId);
      setCopiedCommandId(commandId);
      // Clear the "copied" state after 2 seconds
      setTimeout(() => setCopiedCommandId(null), 2000);
    } catch (error) {
      console.error('Failed to copy command ID:', error);
    }
  };

  const handleOpenKeybindingsFile = () => {
    if (!onOpenQuickPane) return;

    const keybindingsPath = getUserKeybindingsPath(homeDirectory);
    onOpenQuickPane({
      type: 'editor',
      cwd: homeDirectory,
      filePath: keybindingsPath,
    });
    onClose();
  };

  const handleRemoveKeybinding = async (commandId: string) => {
    try {
      const keybindingsPath = getUserKeybindingsPath(homeDirectory);
      await removeUserKeybinding(commandId, keybindingsPath, commandRegistry, keybindingRegistry);
      setEditingCommandId(null);
    } catch (error) {
      console.error('Failed to reset keybinding:', error);
    }
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
          <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Search and filters */}
        <div className="px-6 py-4 border-b border-gray-700 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search keybindings (e.g., 'new tab', '⌘T', 'terminal')..."
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>

          {/* Filter buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterMode('all')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[0.85rem] leading-none transition-colors duration-150 whitespace-nowrap select-none ${
                filterMode === 'all'
                  ? 'bg-gradient-to-br from-secondary-start to-secondary-end text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              All ({rows.length})
            </button>
            <button
              onClick={() => setFilterMode('user')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[0.85rem] leading-none transition-colors duration-150 whitespace-nowrap select-none ${
                filterMode === 'user'
                  ? 'bg-gradient-to-br from-secondary-start to-secondary-end text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              User Modified ({rows.filter(r => r.isUserOverride).length})
            </button>
            <button
              onClick={() => setFilterMode('conflicts')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[0.85rem] leading-none transition-colors duration-150 whitespace-nowrap select-none ${
                filterMode === 'conflicts'
                  ? 'bg-gradient-to-br from-secondary-start to-secondary-end text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              Conflicts ({rows.filter(r => r.hasConflict).length})
            </button>
          </div>
        </div>

        {/* Keybindings table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full border-gray-800">
            <thead className="sticky top-0 bg-gray-800 border-b border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Command
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Keybinding
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  When
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 border-gray-800">
              {filteredRows.map(row => (
                <tr
                  key={row.command.id}
                  className={`hover:bg-gray-800/50 transition-colors ${
                    row.hasConflict ? 'bg-red-500/5' : ''
                  } ${editingCommandId === row.command.id ? 'relative' : ''}`}
                >
                  {/* Command */}
                  <td className="px-6 py-2 overflow-visible">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 group">
                        {row.command.category && (
                          <span className="text-xs text-gray-500">{row.command.category}:</span>
                        )}
                        <span className="text-sm text-white">
                          {row.command.title}
                        </span>
                        {row.isUserOverride && (
                          <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                            User
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyCommandId(row.command.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-all"
                          title={row.command.id}
                          aria-label={`Copy command ID: ${row.command.id}`}
                        >
                          {copiedCommandId === row.command.id ? (
                            <Check className="w-3 h-3 text-gray-400" />
                          ) : (
                            <Copy className="w-3 h-3 text-gray-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  </td>

                  {/* Keybinding */}
                  <td className="px-6 py-2">
                    <div className="flex items-center gap-2">
                      {row.keybinding ? (
                        <kbd className="px-2 py-1 bg-gray-700 rounded font-mono text-xs text-gray-300">
                          {formatKeybindingForDisplay(row.keybinding.chords)}
                        </kbd>
                      ) : (
                        <span className="text-sm text-gray-500 italic">No keybinding</span>
                      )}
                      {row.hasConflict && (
                        <div
                          className="flex items-center gap-1 text-yellow-500"
                          title={`Conflicts with: ${row.conflictingCommands.join(', ')}`}
                        >
                          <AlertTriangle className="w-4 h-4" />
                          <span className="text-xs">Conflict</span>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* When clause */}
                  <td className="px-6 py-2">
                    {row.command.when ? (
                      <code className="text-xs text-gray-400 font-mono">{row.command.when.toString()}</code>
                    ) : (
                      <span className="text-xs text-gray-600">—</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditingCommandId(row.command.id)}
                        className="p-1.5 hover:bg-white/10 rounded transition-colors"
                        title="Edit keybinding"
                      >
                        <Edit2 className="w-4 h-4 text-gray-400" />
                      </button>
                      {row.isUserOverride && (
                        <button
                          onClick={() => handleRemoveKeybinding(row.command.id)}
                          className="p-1.5 hover:bg-blue-500/20 rounded transition-colors"
                          title="Reset to default keybinding"
                        >
                          <RotateCcw className="w-4 h-4 text-blue-400" />
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Keybinding Recorder Overlay */}
                  {editingCommandId === row.command.id && (
                    <td className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
                      <div className="pointer-events-auto">
                        <KeybindingRecorder
                          onKeybindingRecorded={(kb) => handleSaveKeybinding(row.command.id, kb)}
                          onCancel={() => setEditingCommandId(null)}
                          currentKeybinding={row.keybinding ? formatKeybindingForDisplay(row.keybinding.chords) : undefined}
                        />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {filteredRows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <Search className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm">No keybindings found matching your search</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-800/50">
          <p className="text-xs text-gray-500">
            Click the edit icon to change a keybinding. User modifications are saved to{' '}
            <button
              onClick={handleOpenKeybindingsFile}
              className="text-gray-400 hover:text-blue-400 transition-colors cursor-pointer underline decoration-dotted underline-offset-2"
              disabled={!onOpenQuickPane}
              title={onOpenQuickPane ? 'Click to open file in editor' : undefined}
            >
              <code>~/.conduit/keybindings.json</code>
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
