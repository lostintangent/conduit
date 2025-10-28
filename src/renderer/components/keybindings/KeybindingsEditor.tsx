/**
 * Keybindings Editor Component
 *
 * Visual interface for discovering and editing keyboard shortcuts.
 * Similar to VS Code's Keyboard Shortcuts editor (Cmd+K Cmd+S).
 */

import { useState, useMemo, useEffect } from 'react';
import { Search, Edit2, X, AlertTriangle, Trash2 } from 'lucide-react';
import { KeybindingRecorder } from './KeybindingRecorder';
import type { ICommandRegistry } from '../../commands/core/CommandRegistry';
import type { KeybindingRegistry } from '../../commands/keybindings/KeybindingRegistry';
import type { CommandDescriptor } from '../../commands/core/types';
import type { ResolvedKeybinding } from '../../commands/keybindings/types';
import { loadUserKeybindings } from '../../commands/keybindings/userKeybindings';
import { parseKeybindingsFile } from '../../commands/keybindings/keybindingsFile';
import { watchKeybindingsFile } from '../../commands/keybindings/watchKeybindings';

interface KeybindingsEditorProps {
  onClose: () => void;
  commandRegistry: ICommandRegistry;
  keybindingRegistry: KeybindingRegistry;
  homeDirectory: string;
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
  homeDirectory
}: KeybindingsEditorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCommandId, setEditingCommandId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'user' | 'conflicts'>('all');
  const [refreshKey, setRefreshKey] = useState(0);

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

  // Load user keybindings on mount
  useEffect(() => {
    const loadKeybindings = async () => {
      try {
        const keybindingsPath = `${homeDirectory}/.conduit/keybindings.json`;
        await loadUserKeybindings(keybindingRegistry, keybindingsPath);
        setRefreshKey(prev => prev + 1);
      } catch (error) {
        console.error('Failed to load user keybindings:', error);
      }
    };
    loadKeybindings();
  }, [keybindingRegistry, homeDirectory]);

  // Watch keybindings file for external changes
  useEffect(() => {
    const keybindingsPath = `${homeDirectory}/.conduit/keybindings.json`;

    const unwatch = watchKeybindingsFile(keybindingsPath, async () => {
      try {
        // Reload keybindings from file
        await loadUserKeybindings(keybindingRegistry, keybindingsPath);
        // Trigger UI refresh
        setRefreshKey(prev => prev + 1);
      } catch (error) {
        console.error('Failed to reload keybindings after file change:', error);
      }
    });

    return () => {
      unwatch();
    };
  }, [keybindingRegistry, homeDirectory]);

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

    // Detect conflicts (same key, different command)
    const keyToCommands = new Map<string, string[]>();
    keybindingsByCommand.forEach((bindings, commandId) => {
      bindings.forEach(binding => {
        const key = binding.chords.map(k => {
          const parts = [];
          if (k.ctrl) parts.push('Ctrl');
          if (k.alt) parts.push('Alt');
          if (k.shift) parts.push('Shift');
          if (k.meta) parts.push('Cmd');
          parts.push(k.key);
          return parts.join('+');
        }).join(' ');

        const commands = keyToCommands.get(key) || [];
        if (!commands.includes(commandId)) {
          commands.push(commandId);
        }
        keyToCommands.set(key, commands);
      });
    });

    return commands.map(command => {
      const bindings = keybindingsByCommand.get(command.id) || [];

      // Sort by weight (highest first) to get primary keybinding
      const sortedBindings = [...bindings].sort((a, b) => (b.weight || 0) - (a.weight || 0));
      const primaryKeybinding = sortedBindings[0] || null;

      // User bindings have weight >= 1000
      const isUserOverride = primaryKeybinding ? (primaryKeybinding.weight || 0) >= 1000 : false;

      // Check for conflicts
      let hasConflict = false;
      let conflictingCommands: string[] = [];
      if (primaryKeybinding) {
        const key = primaryKeybinding.chords.map(k => {
          const parts = [];
          if (k.ctrl) parts.push('Ctrl');
          if (k.alt) parts.push('Alt');
          if (k.shift) parts.push('Shift');
          if (k.meta) parts.push('Cmd');
          parts.push(k.key);
          return parts.join('+');
        }).join(' ');

        const commandsWithKey = keyToCommands.get(key) || [];
        if (commandsWithKey.length > 1) {
          hasConflict = true;
          conflictingCommands = commandsWithKey.filter(id => id !== command.id);
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
  }, [commandRegistry, keybindingRegistry, refreshKey]);

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
        const keybindingMatch = row.keybinding && formatKeybindingDisplay(row.keybinding).toLowerCase().includes(query);
        return titleMatch || categoryMatch || idMatch || keybindingMatch;
      });
    }

    return filtered;
  }, [rows, searchQuery, filterMode]);

  const handleSaveKeybinding = async (commandId: string, keybinding: string) => {
    try {
      const keybindingsPath = `${homeDirectory}/.conduit/keybindings.json`;

      // Read existing user keybindings
      let userBindings: Array<{ key: string; command: string }> = [];
      if (window.conduit?.readFile) {
        const content = await window.conduit.readFile(keybindingsPath);
        if (content) {
          userBindings = parseKeybindingsFile(content);
        }
      }

      // Remove existing binding for this command
      userBindings = userBindings.filter(kb => kb.command !== commandId);

      // Add new binding
      userBindings.push({
        key: keybinding,
        command: commandId
      });

      // Save to file
      if (window.conduit?.writeFile) {
        const json = JSON.stringify(userBindings, null, 2);
        await window.conduit.writeFile(keybindingsPath, json);
      } else {
        console.warn('window.conduit.writeFile is not available');
      }

      // Register in registry with high weight
      keybindingRegistry.register(commandId, {
        key: keybinding
      }, 1000);

      setEditingCommandId(null);
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error('Failed to save keybinding:', error);
    }
  };

  const handleRemoveKeybinding = async (commandId: string) => {
    try {
      const keybindingsPath = `${homeDirectory}/.conduit/keybindings.json`;

      // Read existing user keybindings
      let userBindings: Array<{ key: string; command: string }> = [];
      if (window.conduit?.readFile) {
        const content = await window.conduit.readFile(keybindingsPath);
        if (content) {
          userBindings = parseKeybindingsFile(content);
        }
      }

      // Remove binding for this command
      userBindings = userBindings.filter(kb => kb.command !== commandId);

      // Save to file
      if (window.conduit?.writeFile) {
        const json = JSON.stringify(userBindings, null, 2);
        await window.conduit.writeFile(keybindingsPath, json);
      } else {
        console.warn('window.conduit.writeFile is not available');
      }

      // Unregister from registry
      keybindingRegistry.unregister(commandId);

      setEditingCommandId(null);
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error('Failed to remove keybinding:', error);
    }
  };

  const formatKeybindingDisplay = (binding: ResolvedKeybinding): string => {
    const chordsStr = binding.chords.map(k => {
      const parts = [];
      if (k.ctrl) parts.push('Ctrl');
      if (k.alt) parts.push('Alt');
      if (k.shift) parts.push('Shift');
      if (k.meta) parts.push('Cmd');
      parts.push(k.key);
      return parts.join('+');
    });

    const keybindingStr = chordsStr.join(' ');

    // Use platform-specific formatting
    const isMac = navigator.userAgent.toLowerCase().includes('mac');

    if (isMac) {
      return keybindingStr
        .replace(/Ctrl/g, '⌃')
        .replace(/Alt/g, '⌥')
        .replace(/Shift/g, '⇧')
        .replace(/Cmd/g, '⌘')
        .replace(/\+/g, '');
    }

    return keybindingStr;
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
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                filterMode === 'all'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              All ({rows.length})
            </button>
            <button
              onClick={() => setFilterMode('user')}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                filterMode === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              User Modified ({rows.filter(r => r.isUserOverride).length})
            </button>
            <button
              onClick={() => setFilterMode('conflicts')}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                filterMode === 'conflicts'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Conflicts ({rows.filter(r => r.hasConflict).length})
            </button>
          </div>
        </div>

        {/* Keybindings table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full">
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
            <tbody className="divide-y divide-gray-800">
              {filteredRows.map(row => (
                <tr
                  key={row.command.id}
                  className={`hover:bg-gray-800/50 transition-colors ${
                    row.hasConflict ? 'bg-red-500/5' : ''
                  }`}
                >
                  {/* Command */}
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        {row.command.category && (
                          <span className="text-xs text-gray-500">{row.command.category}:</span>
                        )}
                        <span className="text-sm text-white">{row.command.title}</span>
                        {row.isUserOverride && (
                          <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                            User
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 font-mono">{row.command.id}</span>
                    </div>
                  </td>

                  {/* Keybinding */}
                  <td className="px-6 py-4">
                    {editingCommandId === row.command.id ? (
                      <KeybindingRecorder
                        onKeybindingRecorded={(kb) => handleSaveKeybinding(row.command.id, kb)}
                        onCancel={() => setEditingCommandId(null)}
                        currentKeybinding={row.keybinding ? formatKeybindingDisplay(row.keybinding) : undefined}
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        {row.keybinding ? (
                          <kbd className="px-2 py-1 bg-gray-700 rounded font-mono text-xs text-gray-300">
                            {formatKeybindingDisplay(row.keybinding)}
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
                    )}
                  </td>

                  {/* When clause */}
                  <td className="px-6 py-4">
                    {row.command.when ? (
                      <code className="text-xs text-gray-400 font-mono">{row.command.when.toString()}</code>
                    ) : (
                      <span className="text-xs text-gray-600">—</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4 text-right">
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
                          className="p-1.5 hover:bg-red-500/20 rounded transition-colors"
                          title="Reset to default"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      )}
                    </div>
                  </td>
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
            <code className="text-gray-400">~/.conduit/keybindings.json</code>
          </p>
        </div>
      </div>
    </div>
  );
}
