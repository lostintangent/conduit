import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AppPreferences } from "../../shared/types";

const preferencesPath = path.join(app.getPath("userData"), "preferences.json");

const defaultPreferences: Omit<AppPreferences, "homeDirectory"> = {
  tabPosition: "bottom",
  commandHistory: [],
  alwaysShowTabStrip: true,
  showOverviewRuler: true,
};

export async function loadPreferences(): Promise<AppPreferences> {
  const homeDirectory = app.getPath("home");

  const preferences = {
    ...defaultPreferences,
    homeDirectory,
  };

  try {
    const fileContents = await fs.readFile(preferencesPath, "utf-8");
    const savedPreferences = JSON.parse(fileContents) as AppPreferences;

    return {
      ...preferences,
      ...savedPreferences,
    };
  } catch {
    return preferences;
  }
}

export async function savePreferences(preferences: AppPreferences) {
  // Save the updated preferences, but only the non-default values
  const payload: Partial<AppPreferences> = {};
  for (const [key, value] of Object.entries(preferences)) {
    if (key === "homeDirectory") {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    if (value === defaultPreferences[key as keyof typeof defaultPreferences]) {
      continue;
    }

    // @ts-ignore-next-line
    payload[key] = value;
  }

  try {
    await fs.writeFile(
      preferencesPath,
      JSON.stringify(payload, null, 2),
      "utf-8"
    );
  } catch (error) {
    console.error("Failed to save preferences:", error);
  }
}
