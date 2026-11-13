import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { PublisherGithub } from "@electron-forge/publisher-github";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { removeUnusedLocales } from "./build/scripts/macOS/remove-locales";

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
    icon: "./build/assets/icon",
    extraResource: [
      path.resolve(__dirname, ".vite/build/webview-preload.js"),
      path.resolve(__dirname, "src/ipc/terminal/shell"),
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
  rebuildConfig: {
    onlyModules: ["node-pty", "@parcel/watcher"],
    // Only force rebuild during packaging, not during dev (npm start)
    force: !!process.env.ELECTRON_FORGE_PACKAGING,
  },
  hooks: {
    packageAfterCopy: async (_, buildPath) => {
      execSync(
        `npm install --omit=dev ${lockedNativeModuleSpecs().join(" ")}`,
        {
          cwd: buildPath,
          stdio: "inherit",
        },
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
    new MakerSquirrel({
      name: "Conduit",
      setupIcon: path.resolve(__dirname, "build/assets/icon.ico"),
      iconUrl:
        "https://raw.githubusercontent.com/lostintangent/conduit/main/build/assets/icon.ico",
      windowsSign: process.env.WINDOWS_CERTIFICATE_FILE
        ? {
            certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
            certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
          }
        : undefined,
    }),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  publishers: [
    new PublisherGithub({
      repository: { owner: "lostintangent", name: "conduit" },
      // Forge falls back to GITHUB_TOKEN when this is unset (as in CI)
      authToken: process.env.CONDUIT_GITHUB_TOKEN,
      draft: false,
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main.ts",
          config: "build/vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/cli/index.ts",
          config: "build/vite.cli.config.ts",
          target: "main",
        },
        {
          entry: "src/preload/window/index.ts",
          config: "build/vite.preload.config.ts",
          target: "preload",
        },
        {
          entry: "src/preload/webview/index.ts",
          config: "build/vite.preload.webview.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "build/vite.renderer.config.ts",
        },
      ],
    }),
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
