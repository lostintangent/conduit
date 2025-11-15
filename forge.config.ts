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
import path from "node:path";
import { removeUnusedLocales } from "./build/scripts/macOS/remove-locales";

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: "**/node_modules/{node-pty,@parcel/watcher}/**/*",
    },
    icon: "./build/assets/icon",
    appBundleId: "dev.conduit",
    appCategoryType: "public.app-category.developer-tools",
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
    force: true,
  },
  hooks: {
    packageAfterCopy: async (_, buildPath) => {
      execSync("npm install --omit=dev node-pty @parcel/watcher", {
        cwd: buildPath,
        stdio: "inherit",
      });
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
    new MakerSquirrel({}),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  publishers: [
    new PublisherGithub({
      repository: {
        owner: "lostintangent",
        name: "conduit-release",
      },
      authToken: process.env.CONDUIT_GITHUB_TOKEN,
      prerelease: false,
      draft: false,
      generateReleaseNotes: false,
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
          entry: "src/preload.ts",
          config: "build/vite.preload.config.ts",
          target: "preload",
        },
        {
          entry: "src/cli/index.ts",
          config: "build/vite.cli.config.ts",
          target: "main",
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
