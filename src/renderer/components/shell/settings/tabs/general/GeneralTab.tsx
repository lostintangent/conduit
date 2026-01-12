/**
 * General Settings Tab Component
 *
 * General user preferences including theme, appearance, terminal, editor, and repository shortcuts
 */

import { updateTerminalFonts } from "@/components/panes/terminal/state/xtermCache";
import { useDotfiles } from "@/hooks/useDotfiles";
import { useUserSettings } from "@/hooks/useUserSettings";
import { quickPaneAtom } from "@/store/atoms";
import { capitalize } from "@/utils";
import type {
  PlayButtonTarget,
  TerminalLinkTarget,
  ThemeMode,
  UserSettings,
} from "@shared/types";
import { useSetAtom } from "jotai";
import type { LucideIcon } from "lucide-react";
import {
  Check,
  ChevronDown,
  FolderOpen,
  Loader2,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  Sun,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  CheckboxSetting,
  SettingSection,
  TextInputSetting,
} from "./SettingControls";

const themeOptions = new Map<ThemeMode, LucideIcon>([
  ["light", Sun],
  ["dark", Moon],
  ["system", Monitor],
]);

interface GeneralTabProps {
  userSettings: ReturnType<typeof useUserSettings>;
  onUpdateSettings: (updates: Partial<UserSettings>) => void;
}

export function GeneralTab({
  userSettings,
  onUpdateSettings,
}: GeneralTabProps) {
  const setQuickPane = useSetAtom(quickPaneAtom);
  const showLaunchButton = userSettings.showLaunchButton ?? false;
  const showPlayButton = userSettings.showPlayButton ?? false;
  const playButtonTarget = userSettings.playButtonTarget ?? "newPane";

  const [dotfilesRepo, setDotfilesRepo] = useState(
    userSettings.dotfilesRepo || "",
  );
  const [terminalShell, setTerminalShell] = useState(
    userSettings.terminalShell || "",
  );
  const [terminalFontFamily, setTerminalFontFamily] = useState(
    userSettings.terminalFontFamily || "",
  );
  const [isHoveringDotfilesStatus, setIsHoveringDotfilesStatus] =
    useState(false);

  const {
    status: dotfilesStatus,
    repoPath,
    fetchDotfiles,
    createDotfilesRepo,
  } = useDotfiles();

  const handleCreateDotfiles = async () => {
    const url = await createDotfilesRepo();
    if (url) {
      setDotfilesRepo(url);
      onUpdateSettings({ dotfilesRepo: url });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-2xl space-y-6">
        {/* Theme Section */}
        <SettingSection title="Appearance">
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

          <CheckboxSetting
            id="alwaysHighlightActivePane"
            label="Always highlight active pane"
            description="Keep the active pane border visible instead of fading out"
            checked={userSettings.alwaysHighlightActivePane}
            onChange={(checked) =>
              onUpdateSettings({ alwaysHighlightActivePane: checked })
            }
          />

          <CheckboxSetting
            id="dimInactivePanes"
            label="Dim inactive panes"
            description="Slightly dim inactive panes to highlight the active one"
            checked={userSettings.dimInactivePanes}
            onChange={(checked) =>
              onUpdateSettings({ dimInactivePanes: checked })
            }
          />

          <CheckboxSetting
            id="alwaysShowTabs"
            label="Always show tabs"
            description="Show the tab bar even when there is only one tab"
            checked={userSettings.alwaysShowTabs}
            onChange={(checked) =>
              onUpdateSettings({ alwaysShowTabs: checked })
            }
          />

          <CheckboxSetting
            id="useGradientBorders"
            label="Show gradient borders"
            description="Display colorful gradient borders on panes and tabs"
            checked={userSettings.useGradientBorders}
            onChange={(checked) =>
              onUpdateSettings({ useGradientBorders: checked })
            }
          />
        </SettingSection>

        {/* Terminal Settings Section */}
        <SettingSection title="Terminal">
          {/* Dotfiles Repo Setting - Complex input with buttons, kept as-is */}
          <div>
            <label
              htmlFor="dotfilesRepo"
              className="text-sm text-tinted-foreground/80 block mb-2"
            >
              Dotfiles Repository
            </label>
            <div className="relative">
              <input
                type="text"
                id="dotfilesRepo"
                value={dotfilesRepo}
                onChange={(e) => setDotfilesRepo(e.target.value)}
                onBlur={() => {
                  if (dotfilesRepo !== userSettings.dotfilesRepo) {
                    onUpdateSettings({ dotfilesRepo });
                  }
                }}
                placeholder="username/dotfiles or https://github.com/username/dotfiles.git"
                className="w-full px-3 py-2 bg-tinted border border-tinted-border rounded text-sm text-tinted-foreground placeholder:text-tinted-foreground/40 focus:outline-none focus:border-accent pr-20"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                {!dotfilesRepo && (
                  <button
                    onClick={handleCreateDotfiles}
                    className="p-1 hover:bg-tinted-foreground/10 rounded text-tinted-foreground/60 transition-colors"
                    title="Create Dotfiles Repo"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
                {dotfilesStatus !== "disabled" && dotfilesRepo && (
                  <button
                    onClick={() =>
                      setQuickPane({
                        type: "editor",
                        cwd: repoPath,
                      })
                    }
                    disabled={dotfilesStatus !== "idle"}
                    className="p-1 hover:bg-tinted-foreground/10 rounded text-tinted-foreground/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Open in Editor"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>
                )}
                {dotfilesRepo && (
                  <button
                    onClick={() => fetchDotfiles()}
                    onMouseEnter={() => setIsHoveringDotfilesStatus(true)}
                    onMouseLeave={() => setIsHoveringDotfilesStatus(false)}
                    disabled={dotfilesStatus !== "idle"}
                    className="p-1 hover:bg-tinted-foreground/10 rounded transition-colors disabled:cursor-not-allowed"
                    title="Sync dotfiles"
                  >
                    {dotfilesStatus === "cloning" ||
                    dotfilesStatus === "fetching" ||
                    dotfilesStatus === "pushing" ? (
                      <Loader2 className="w-4 h-4 text-tinted-foreground/50 animate-spin" />
                    ) : dotfilesStatus === "failed" ? (
                      <X className="w-4 h-4 text-red-500" />
                    ) : isHoveringDotfilesStatus ? (
                      <RefreshCw className="w-4 h-4 text-tinted-foreground/60" />
                    ) : (
                      <Check className="w-4 h-4 text-green-500" />
                    )}
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-tinted-foreground/50 mt-1">
              Shell dotfiles and agent skills, symlinked to your home directory.
            </p>
          </div>

          <TextInputSetting
            id="terminalShell"
            label="Shell"
            description="The shell to use for terminal panes (e.g., /bin/zsh, /bin/bash)"
            value={terminalShell}
            onChange={(value) => setTerminalShell(value)}
            onBlur={() => {
              if (terminalShell !== userSettings.terminalShell) {
                onUpdateSettings({
                  terminalShell: terminalShell || undefined,
                });
              }
            }}
            placeholder="Default shell"
          />

          <TextInputSetting
            id="terminalFontFamily"
            label="Font Family"
            value={terminalFontFamily}
            onChange={(value) => {
              setTerminalFontFamily(value);
              updateTerminalFonts(value, userSettings.terminalFontSize!);
            }}
            onBlur={() => {
              if (terminalFontFamily !== userSettings.terminalFontFamily) {
                onUpdateSettings({ terminalFontFamily });
              }
            }}
          />

          <TextInputSetting
            id="terminalFontSize"
            label="Font Size"
            type="number"
            value={userSettings.terminalFontSize ?? 13}
            onChange={(value) => {
              const fontSize = parseInt(value, 10);
              if (!isNaN(fontSize) && fontSize > 0) {
                onUpdateSettings({ terminalFontSize: fontSize });
                updateTerminalFonts(userSettings.terminalFontFamily!, fontSize);
              }
            }}
            min={8}
            max={32}
          />

          <CheckboxSetting
            id="showTabState"
            label="Show tab state indicators"
            description="Display the running and unseen state of terminals in tab buttons"
            checked={userSettings.showTabState}
            onChange={(checked) => onUpdateSettings({ showTabState: checked })}
          />

          <CheckboxSetting
            id="showTerminalRuler"
            label="Show terminal ruler"
            description="Display a ruler in terminal panes"
            checked={userSettings.showTerminalRuler}
            onChange={(checked) =>
              onUpdateSettings({ showTerminalRuler: checked })
            }
          />

          <div>
            <label className="text-sm text-tinted-foreground/60 block mb-2">
              Link target
            </label>
            <div className="relative max-w-xs">
              <select
                value={userSettings.terminalLinkTarget ?? "pane"}
                onChange={(e) =>
                  onUpdateSettings({
                    terminalLinkTarget: e.target.value as TerminalLinkTarget,
                  })
                }
                className="w-full px-3 py-2 bg-tinted border border-tinted-border rounded text-sm text-tinted-foreground focus:outline-none focus:border-accent appearance-none pr-10"
              >
                <option value="pane">Browser pane</option>
                <option value="sidebar">Sidebar</option>
              </select>
              <ChevronDown className="w-4 h-4 text-tinted-foreground/60 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <p className="text-xs text-tinted-foreground/50 mt-2">
              {userSettings.terminalLinkTarget === "sidebar"
                ? "Opens clicked links in the sidebar browser view"
                : "Opens clicked links in a browser pane within the current tab"}
            </p>
          </div>
        </SettingSection>

        {/* Editor Settings Section */}
        <SettingSection title="Editor">
          <CheckboxSetting
            id="useConduitAsEditor"
            label="Use Conduit as $EDITOR"
            description="Set Conduit as the default editor for command-line tools"
            checked={userSettings.useConduitAsEditor}
            onChange={(checked) =>
              onUpdateSettings({ useConduitAsEditor: checked })
            }
          />

          <CheckboxSetting
            id="useEditorV2"
            label="Use Editor v2"
            description="Enable the new editor implementation (experimental)"
            checked={userSettings.useEditorV2}
            onChange={(checked) => onUpdateSettings({ useEditorV2: checked })}
          />

          <CheckboxSetting
            id="trackUnseenChangesInReviewMode"
            label="Track unseen changes in Review Mode"
            description="Show indicators for files modified by external processes while in Review Mode"
            checked={userSettings.trackUnseenChangesInReviewMode ?? true}
            onChange={(checked) =>
              onUpdateSettings({ trackUnseenChangesInReviewMode: checked })
            }
          />
        </SettingSection>

        {/* Workspace Settings Section */}
        <SettingSection title="Workspaces">
          <CheckboxSetting
            id="autoSaveWorkspaces"
            label="Auto-save workspaces"
            description="Automatically save workspace changes"
            checked={userSettings.autoSaveWorkspaces}
            onChange={(checked) =>
              onUpdateSettings({ autoSaveWorkspaces: checked })
            }
          />
        </SettingSection>

        {/* Repository Shortcuts Section */}
        <SettingSection title="Repository Shortcuts">
          <CheckboxSetting
            id="showLaunchButton"
            label="Show launch button when in a repository"
            description="Display a quick launch button when the current directory is a git repository"
            checked={showLaunchButton}
            onChange={(checked) =>
              onUpdateSettings({ showLaunchButton: checked })
            }
          />

          <CheckboxSetting
            id="showPlayButton"
            label="Show play button when in repo with package.json"
            description="Display a play button to run npm scripts when package.json is detected"
            checked={showPlayButton}
            onChange={(checked) =>
              onUpdateSettings({ showPlayButton: checked })
            }
          />

          {/* Play Button Target - Complex select with conditional UI, kept as-is */}
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
        </SettingSection>
      </div>
    </div>
  );
}
