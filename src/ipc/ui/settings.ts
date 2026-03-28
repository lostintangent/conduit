import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { UserSettings } from "../../shared/types";

const SETTINGS_FILE_NAME = "settings.json";
let settingsPath: string;

const defaultSettings: Omit<UserSettings, "homeDirectory"> = {
  tabPosition: "bottom",
  alwaysShowTabs: true,
  alwaysHighlightActivePane: false,
  commandHistory: [],
  urlHistory: [],
  starredPages: [],
  showTerminalRuler: true,
  showTabState: true,
  terminalLinkTarget: "pane",
  autoSaveWorkspaces: true,
  useGradientBorders: false,
  dimInactivePanes: false,
  useConduitAsEditor: true,
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

    return {
      ...settings,
      ...savedSettings,
    };
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
