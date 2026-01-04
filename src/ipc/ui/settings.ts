import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { UserSettings } from "../../shared/types";

const SETTINGS_FILE_NAME = "settings.json";
let settingsPath: string;

/**
 * Check if Editor v2 should be enabled via environment variable.
 * Usage: VITE_USE_EDITOR_V2=true npm start
 *
 * Note: In the main process, we access env vars via process.env.
 * The VITE_ prefix is kept for consistency with the renderer-side check.
 */
const shouldUseEditorV2 = (): boolean => {
  const envValue = process.env.VITE_USE_EDITOR_V2;
  if (envValue === "true" || envValue === "1") return true;
  if (envValue === "false" || envValue === "0") return false;
  return true; // Default to v2
};

const defaultSettings: Omit<UserSettings, "homeDirectory"> = {
  tabPosition: "bottom",
  alwaysShowTabs: true,
  commandHistory: [],
  urlHistory: [],
  starredPages: [],
  showTerminalRuler: true,
  showTabState: true,
  autoSaveWorkspaces: true,
  useGradientBorders: true,
  dimInactivePanes: false,
  useConduitAsEditor: true,
  useEditorV2: shouldUseEditorV2(), // Controlled by VITE_USE_EDITOR_V2 env var
  trackUnseenChangesInReviewMode: true, // Show unseen indicators in Review Mode by default
  theme: "dark",
  terminalPromptBufferLines: 100,
  terminalFontFamily: '"Fira Code", Menlo, Monaco, "Courier New", monospace',
  terminalFontSize: 13,
};

export async function loadSettings(
  conduitStateDirectory: string,
): Promise<UserSettings> {
  settingsPath = path.join(conduitStateDirectory, SETTINGS_FILE_NAME);

  const homeDirectory = app.getPath("home");

  const settings = {
    ...defaultSettings,
    homeDirectory,
  };

  try {
    const fileContents = await fs.readFile(settingsPath, "utf-8");
    const savedSettings = JSON.parse(fileContents) as UserSettings;

    const result = {
      ...settings,
      ...savedSettings,
    };

    // Environment variable takes precedence over saved settings for useEditorV2
    // This allows developers to easily test either version without modifying saved settings
    if (process.env.VITE_USE_EDITOR_V2 !== undefined) {
      result.useEditorV2 = shouldUseEditorV2();
    }

    return result;
  } catch {
    console.log("[Settings] No saved settings, using defaults");
    return settings;
  }
}

export async function saveSettings(settings: UserSettings) {
  // Save the updated settings, but only the non-default values
  const payload: Partial<UserSettings> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (key === "homeDirectory") {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    if (value === defaultSettings[key as keyof typeof defaultSettings]) {
      continue;
    }

    // @ts-expect-error - Dynamic key assignment
    payload[key] = value;
  }

  try {
    await fs.writeFile(settingsPath, JSON.stringify(payload, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
}
