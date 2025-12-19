/**
 * Advanced Settings Tab Component
 *
 * Advanced user preferences including theme, advanced settings, and repository shortcuts
 */

import { updateTerminalFonts } from "@/components/panes/terminal/xtermCache";
import { useUserSettings } from "@/hooks/useUserSettings";
import { capitalize } from "@/utils";
import type { PlayButtonTarget, ThemeMode, UserSettings } from "@shared/types";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, Monitor, Moon, Sun } from "lucide-react";

const themeOptions = new Map<ThemeMode, LucideIcon>([
  ["light", Sun],
  ["dark", Moon],
  ["system", Monitor],
]);

interface AdvancedTabProps {
  userSettings: ReturnType<typeof useUserSettings>;
  onUpdateSettings: (updates: Partial<UserSettings>) => void;
}

export function AdvancedTab({
  userSettings,
  onUpdateSettings,
}: AdvancedTabProps) {
  const showLaunchButton = userSettings.showLaunchButton ?? false;
  const showPlayButton = userSettings.showPlayButton ?? false;
  const playButtonTarget = userSettings.playButtonTarget ?? "newPane";

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-2xl space-y-6">
        {/* Theme Section */}
        <div>
          <h3 className="text-sm font-semibold text-tinted-foreground mb-4">
            Appearance
          </h3>
          <div className="space-y-4 bg-tinted-muted rounded-lg p-4">
            <div>
              <label className="text-sm text-tinted-foreground/60 block mb-2">
                Theme
              </label>
              <div className="grid grid-cols-3 gap-2">
                {Array.from(themeOptions.entries()).map(([value, Icon]) => (
                  <button
                    key={value}
                    onClick={() => onUpdateSettings({ theme: value })}
                    className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                      userSettings.theme === value
                        ? "bg-accent/20 border-accent text-accent"
                        : "bg-tinted border-tinted-border text-tinted-foreground/60 hover:border-tinted-foreground/30"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm">{capitalize(value)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="dimInactivePanes"
                checked={userSettings.dimInactivePanes}
                onChange={(e) =>
                  onUpdateSettings({ dimInactivePanes: e.target.checked })
                }
                className="mt-0.5 w-4 h-4 bg-tinted border border-tinted-border rounded accent-accent"
              />
              <div className="flex-1">
                <label
                  htmlFor="dimInactivePanes"
                  className="text-sm text-tinted-foreground/80 cursor-pointer"
                >
                  Dim inactive panes
                </label>
                <p className="text-xs text-tinted-foreground/50 mt-1">
                  Slightly dim inactive panes to highlight the active one
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="alwaysShowTabs"
                checked={userSettings.alwaysShowTabs}
                onChange={(e) =>
                  onUpdateSettings({ alwaysShowTabs: e.target.checked })
                }
                className="mt-0.5 w-4 h-4 bg-tinted border border-tinted-border rounded accent-accent"
              />
              <div className="flex-1">
                <label
                  htmlFor="alwaysShowTabs"
                  className="text-sm text-tinted-foreground/80 cursor-pointer"
                >
                  Always show tabs
                </label>
                <p className="text-xs text-tinted-foreground/50 mt-1">
                  Show the tab bar even when there is only one tab
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="useGradientBorders"
                checked={userSettings.useGradientBorders}
                onChange={(e) =>
                  onUpdateSettings({ useGradientBorders: e.target.checked })
                }
                className="mt-0.5 w-4 h-4 bg-tinted border border-tinted-border rounded accent-accent"
              />
              <div className="flex-1">
                <label
                  htmlFor="useGradientBorders"
                  className="text-sm text-tinted-foreground/80 cursor-pointer"
                >
                  Show gradient borders
                </label>
                <p className="text-xs text-tinted-foreground/50 mt-1">
                  Display colorful gradient borders on panes and tabs
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Terminal Settings Section */}
        <div>
          <h3 className="text-sm font-semibold text-tinted-foreground mb-4">
            Terminal
          </h3>
          <div className="space-y-4 bg-tinted-muted rounded-lg p-4">
            <div>
              <label
                htmlFor="terminalShell"
                className="text-sm text-tinted-foreground/80 block mb-2"
              >
                Shell
              </label>
              <input
                type="text"
                id="terminalShell"
                value={userSettings.terminalShell ?? ""}
                onChange={(e) =>
                  onUpdateSettings({
                    terminalShell: e.target.value || undefined,
                  })
                }
                placeholder="Default shell"
                className="w-full px-3 py-2 bg-tinted border border-tinted-border rounded text-sm text-tinted-foreground placeholder:text-tinted-foreground/40 focus:outline-none focus:border-accent"
              />
              <p className="text-xs text-tinted-foreground/50 mt-1">
                The shell to use for terminal panes (e.g., /bin/zsh, /bin/bash)
              </p>
            </div>

            <div>
              <label
                htmlFor="terminalFontFamily"
                className="text-sm text-tinted-foreground/80 block mb-2"
              >
                Font Family
              </label>
              <input
                type="text"
                id="terminalFontFamily"
                value={userSettings.terminalFontFamily ?? ""}
                onChange={(e) => {
                  const fontFamily = e.target.value;
                  onUpdateSettings({ terminalFontFamily: fontFamily });
                  updateTerminalFonts(
                    fontFamily,
                    userSettings.terminalFontSize!,
                  );
                }}
                className="w-full px-3 py-2 bg-tinted border border-tinted-border rounded text-sm text-tinted-foreground focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label
                htmlFor="terminalFontSize"
                className="text-sm text-tinted-foreground/80 block mb-2"
              >
                Font Size
              </label>
              <input
                type="number"
                id="terminalFontSize"
                value={userSettings.terminalFontSize ?? 13}
                onChange={(e) => {
                  const fontSize = parseInt(e.target.value, 10);
                  if (!isNaN(fontSize) && fontSize > 0) {
                    onUpdateSettings({ terminalFontSize: fontSize });
                    updateTerminalFonts(
                      userSettings.terminalFontFamily!,
                      fontSize,
                    );
                  }
                }}
                min={8}
                max={32}
                className="w-24 px-3 py-2 bg-tinted border border-tinted-border rounded text-sm text-tinted-foreground focus:outline-none focus:border-accent"
              />
            </div>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="showTerminalRuler"
                checked={userSettings.showTerminalRuler}
                onChange={(e) =>
                  onUpdateSettings({ showTerminalRuler: e.target.checked })
                }
                className="mt-0.5 w-4 h-4 bg-tinted border border-tinted-border rounded accent-accent"
              />
              <div className="flex-1">
                <label
                  htmlFor="showTerminalRuler"
                  className="text-sm text-tinted-foreground/80 cursor-pointer"
                >
                  Show terminal ruler
                </label>
                <p className="text-xs text-tinted-foreground/50 mt-1">
                  Display a ruler in terminal panes
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Editor Settings Section */}
        <div>
          <h3 className="text-sm font-semibold text-tinted-foreground mb-4">
            Editor
          </h3>
          <div className="space-y-4 bg-tinted-muted rounded-lg p-4">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="useConduitAsEditor"
                checked={userSettings.useConduitAsEditor}
                onChange={(e) =>
                  onUpdateSettings({ useConduitAsEditor: e.target.checked })
                }
                className="mt-0.5 w-4 h-4 bg-tinted border border-tinted-border rounded accent-accent"
              />
              <div className="flex-1">
                <label
                  htmlFor="useConduitAsEditor"
                  className="text-sm text-tinted-foreground/80 cursor-pointer"
                >
                  Use Conduit as $EDITOR
                </label>
                <p className="text-xs text-tinted-foreground/50 mt-1">
                  Set Conduit as the default editor for command-line tools
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="useEditorV2"
                checked={userSettings.useEditorV2}
                onChange={(e) =>
                  onUpdateSettings({ useEditorV2: e.target.checked })
                }
                className="mt-0.5 w-4 h-4 bg-tinted border border-tinted-border rounded accent-accent"
              />
              <div className="flex-1">
                <label
                  htmlFor="useEditorV2"
                  className="text-sm text-tinted-foreground/80 cursor-pointer"
                >
                  Use Editor v2
                </label>
                <p className="text-xs text-tinted-foreground/50 mt-1">
                  Enable the new editor implementation (experimental)
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="trackUnseenChangesInReviewMode"
                checked={userSettings.trackUnseenChangesInReviewMode ?? true}
                onChange={(e) =>
                  onUpdateSettings({
                    trackUnseenChangesInReviewMode: e.target.checked,
                  })
                }
                className="mt-0.5 w-4 h-4 bg-tinted border border-tinted-border rounded accent-accent"
              />
              <div className="flex-1">
                <label
                  htmlFor="trackUnseenChangesInReviewMode"
                  className="text-sm text-tinted-foreground/80 cursor-pointer"
                >
                  Track unseen changes in Review Mode
                </label>
                <p className="text-xs text-tinted-foreground/50 mt-1">
                  Show indicators for files modified by external processes while
                  in Review Mode
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Workspace Settings Section */}
        <div>
          <h3 className="text-sm font-semibold text-tinted-foreground mb-4">
            Workspaces
          </h3>
          <div className="space-y-4 bg-tinted-muted rounded-lg p-4">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="autoSaveWorkspaces"
                checked={userSettings.autoSaveWorkspaces}
                onChange={(e) =>
                  onUpdateSettings({ autoSaveWorkspaces: e.target.checked })
                }
                className="mt-0.5 w-4 h-4 bg-tinted border border-tinted-border rounded accent-accent"
              />
              <div className="flex-1">
                <label
                  htmlFor="autoSaveWorkspaces"
                  className="text-sm text-tinted-foreground/80 cursor-pointer"
                >
                  Auto-save workspaces
                </label>
                <p className="text-xs text-tinted-foreground/50 mt-1">
                  Automatically save workspace changes
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Repository Shortcuts Section */}
        <div>
          <h3 className="text-sm font-semibold text-tinted-foreground mb-4">
            Repository Shortcuts
          </h3>
          <div className="space-y-4 bg-tinted-muted rounded-lg p-4">
            {/* Show Launch Button */}
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="showLaunchButton"
                checked={showLaunchButton}
                onChange={(e) =>
                  onUpdateSettings({ showLaunchButton: e.target.checked })
                }
                className="mt-0.5 w-4 h-4 bg-tinted border border-tinted-border rounded accent-accent"
              />
              <div className="flex-1">
                <label
                  htmlFor="showLaunchButton"
                  className="text-sm text-tinted-foreground/80 cursor-pointer"
                >
                  Show launch button when in a repository
                </label>
                <p className="text-xs text-tinted-foreground/50 mt-1">
                  Display a quick launch button when the current directory is a
                  git repository
                </p>
              </div>
            </div>

            {/* Show Play Button */}
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="showPlayButton"
                checked={showPlayButton}
                onChange={(e) =>
                  onUpdateSettings({ showPlayButton: e.target.checked })
                }
                className="mt-0.5 w-4 h-4 bg-tinted border border-tinted-border rounded accent-accent"
              />
              <div className="flex-1">
                <label
                  htmlFor="showPlayButton"
                  className="text-sm text-tinted-foreground/80 cursor-pointer"
                >
                  Show play button when in repo with package.json
                </label>
                <p className="text-xs text-tinted-foreground/50 mt-1">
                  Display a play button to run npm scripts when package.json is
                  detected
                </p>
              </div>
            </div>

            {/* Play Button Target */}
            <div className="pl-7">
              <label className="text-xs text-tinted-foreground/60 block mb-2">
                Play button target
              </label>
              <div className="relative max-w-xs">
                <select
                  value={playButtonTarget}
                  onChange={(e) =>
                    onUpdateSettings({
                      playButtonTarget: e.target.value as PlayButtonTarget,
                    })
                  }
                  disabled={!showPlayButton}
                  className="w-full px-3 py-2 bg-tinted border border-tinted-border rounded text-sm text-tinted-foreground focus:outline-none focus:border-accent appearance-none pr-10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="newPane">New pane</option>
                  <option value="hyper">Hyper terminal</option>
                </select>
                <ChevronDown className="w-4 h-4 text-tinted-foreground/60 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <p className="text-xs text-tinted-foreground/50 mt-2">
                {playButtonTarget === "newPane"
                  ? "Opens npm scripts in a new pane within Conduit"
                  : "Opens npm scripts in the external Hyper terminal"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
