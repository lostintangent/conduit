import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { UserSettings } from "../../shared/types";

const settingsPath = path.join(app.getPath("userData"), "settings.json");

const defaultSettings: Omit<UserSettings, "homeDirectory"> = {
  tabPosition: "bottom",
  alwaysShowTabs: true,
  commandHistory: [],
  urlHistory: [],
  showTerminalRuler: true,
  autoSaveWorkspaces: true,
  useConduitAsEditor: true,
};

export async function loadSettings(): Promise<UserSettings> {
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

    // @ts-ignore-next-line
    payload[key] = value;
  }

  try {
    await fs.writeFile(settingsPath, JSON.stringify(payload, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
}
