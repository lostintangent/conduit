import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Configuration loaded from .env.local file
 */
export type VMConfig = {
  managerUrl: string;
  token: string; // Used for both VM API auth and as GITHUB_TOKEN in VM
  defaultImageId: string;
};

let cachedConfig: VMConfig | null = null;

/**
 * Load VM configuration from .env.local file
 * Includes NODE, TOKEN (used for both VM API and as GITHUB_TOKEN in VM), and IMAGE_ID
 */
export async function loadConfig(): Promise<VMConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = path.join(app.getAppPath(), ".env.local");

  try {
    const content = await fs.readFile(configPath, "utf-8");
    const config: Partial<VMConfig> = {};

    content.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return;
      }

      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=").trim();

      if (key === "NODE") {
        config.managerUrl = value;
      } else if (key === "TOKEN") {
        config.token = value;
      } else if (key === "IMAGE_ID") {
        config.defaultImageId = value;
      }
    });

    if (!config.managerUrl || !config.token || !config.defaultImageId) {
      throw new Error(
        "Missing required configuration. Ensure NODE, TOKEN, and IMAGE_ID are set in .env.local",
      );
    }

    cachedConfig = config as VMConfig;
    return cachedConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        ".env.local file not found. Please create it with NODE, TOKEN, and IMAGE_ID",
      );
    }
    throw error;
  }
}

/**
 * Reload configuration (useful after .env.local changes)
 */
export function reloadConfig(): void {
  cachedConfig = null;
}
