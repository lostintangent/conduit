import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerZIP } from "@electron-forge/maker-zip";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { PublisherGitHub } from "@electron-forge/publisher-github";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { removeUnusedLocales } from "./build/scripts/macOS/remove-locales";
import { makeSpawnHelperExecutable } from "./build/scripts/spawn-helper";

const NATIVE_MODULES = ["node-pty", "@parcel/watcher", "@vscode/ripgrep"];

// The packaging hook installs outside the lockfile, so pin each native
// module to the version installed here.
function lockedNativeModuleSpecs(): string[] {
  return NATIVE_MODULES.map((name) => {
    const manifest = path.join(__dirname, "node_modules", name, "package.json");
    return `${name}@${JSON.parse(fs.readFileSync(manifest, "utf8")).version}`;
  });
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      // The trailing wildcards include per-platform binary packages such as
      // @parcel/watcher-darwin-arm64 and @vscode/ripgrep-darwin-arm64.
      unpack:
        "**/node_modules/{node-pty,@parcel/watcher*,@vscode/ripgrep*}/**/*",
    },
    // Only the bundled output ships; native modules are installed below.
    ignore: (file: string) => !!file && !file.startsWith("/dist"),
    icon: "./build/assets/icon",
    extraResource: [
      path.resolve(__dirname, "dist/main/webview-preload.js"),
      path.resolve(__dirname, "src/features/terminal/main/shell"),
    ],
    appBundleId: "dev.conduit",
    appCategoryType: "public.app-category.developer-tools",
    extendInfo: {
      NSAppleEventsUsageDescription:
        "Conduit needs to communicate with other applications to open files in Finder and URLs in your browser.",
    },
    osxSign: process.env.CONDUIT_APPLE_ID_PASSWORD
      ? {
          identity: "Developer ID Application: Jonathan Carter (RHFNBL7EG4)",
          optionsForFile: () => ({
            hardenedRuntime: true,
            entitlements: "./build/assets/entitlements.plist",
            entitlementsInherit: "./build/assets/entitlements.plist",
          }),
        }
      : undefined,
    osxNotarize: process.env.CONDUIT_APPLE_ID_PASSWORD
      ? {
          appleId: "joncart@outlook.com",
          appleIdPassword: process.env.CONDUIT_APPLE_ID_PASSWORD,
          teamId: "RHFNBL7EG4",
        }
      : undefined,
  },
  // Every native module ships N-API prebuilds, so skip Forge's rebuild.
  rebuildConfig: { onlyModules: [] },
  hooks: {
    prePackage: async () => {
      execFileSync("bun", ["build/bun.build.ts"], { stdio: "inherit" });
    },
    packageAfterCopy: async (_, buildPath) => {
      execFileSync("bun", ["add", "--no-save", ...lockedNativeModuleSpecs()], {
        cwd: buildPath,
        stdio: "inherit",
      });
      makeSpawnHelperExecutable(buildPath);
      // Electron reads name, version and main from the app's package.json.
      fs.copyFileSync(
        path.resolve(__dirname, "package.json"),
        path.join(buildPath, "package.json"),
      );
    },
    postPackage: async (_, options) => {
      removeUnusedLocales(options.outputPaths[0], options.platform);
    },
  },
  makers: [
    new MakerZIP({}, ["darwin"]),
    new MakerDMG({
      icon: path.resolve(__dirname, "build/assets/icon.icns"),
      name: "Conduit",
    }),
  ],
  publishers: [
    new PublisherGitHub({
      repository: { owner: "lostintangent", name: "conduit" },
      // Forge falls back to GITHUB_TOKEN when this is unset (as in CI)
      authToken: process.env.CONDUIT_GITHUB_TOKEN,
      draft: false,
    }),
  ],
  plugins: [
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: true,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
