const CLUSTER_URL = "https://green.sandbox.githubnext.com/";
const IMAGE_ID = "image_custom_756deba8-98cf-fc82-788d-2af2e4664e22";

export type VMConfig = {
  managerUrl: string;
  token: string; // Used for both VM API auth and as GITHUB_TOKEN in VM
  defaultImageId: string;
};

let cachedConfig: VMConfig | null = null;

export async function loadConfig(): Promise<VMConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const config: Partial<VMConfig> = {
    managerUrl: CLUSTER_URL,
    defaultImageId: IMAGE_ID,
  };

  if (process.env.GITHUB_TOKEN) {
    config.token = process.env.GITHUB_TOKEN;
  } else {
    throw new Error(
      "In order to use cloud VMs, you must define a GitHub PAT via the GITHUB_TOKEN environment variable.",
    );
  }

  cachedConfig = config as VMConfig;
  return cachedConfig;
}

/**
 * Reload configuration (useful after .env.local changes)
 */
export function reloadConfig(): void {
  cachedConfig = null;
}
