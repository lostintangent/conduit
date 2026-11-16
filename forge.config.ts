import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerZIP } from "@electron-forge/maker-zip";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { PublisherGitHub } from "@electron-forge/publisher-github";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
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

// @parcel/watcher 2.6.0 starts its FSEvents stream before it creates the tree
// that the stream's callback reads, so a file change in that gap crashes the
// app. Ship a build with the fix from parcel-bundler/watcher#275 instead of the
// prebuilt binary. Each step throws if it fails, so the unpatched binary can't
// ship by accident.
// TODO: Delete this and build/patches once a release includes that fix.
function buildPatchedWatcher(
  buildPath: string,
  electronVersion: string,
  arch: string,
) {
  const watcher = path.join(buildPath, "node_modules", "@parcel", "watcher");
  const patch = path.resolve(
    __dirname,
    "build/patches/parcel-watcher-fsevents-race.patch",
  );
  execFileSync(
    "patch",
    ["-p1", "--forward", "--batch", "--fuzz=0", "-i", patch],
    { cwd: watcher },
  );
  const nodeGyp = createRequire(__filename).resolve("node-gyp/bin/node-gyp.js");
  execFileSync(
    "node",
    [
      nodeGyp,
      "rebuild",
      `--target=${electronVersion}`,
      `--arch=${arch}`,
      "--dist-url=https://electronjs.org/headers",
      "--loglevel=error",
    ],
    // Compiler warnings stay quiet, and a failure's error includes them.
    { cwd: watcher, stdio: "pipe" },
  );
  // Overwrite the binary that @parcel/watcher's loader resolves first.
  const prebuilt = createRequire(path.join(watcher, "index.js")).resolve(
    `@parcel/watcher-darwin-${arch}`,
  );
  fs.copyFileSync(path.join(watcher, "build/Release/watcher.node"), prebuilt);
}

// node-pty ships prebuilds for every platform, about 60 MB of Windows binaries
// and debug symbols, and both modules ship what it takes to build from source.
// The app only runs on macOS, so keep the one prebuild it loads.
function pruneNativeModules(buildPath: string, arch: string) {
  const modules = path.join(buildPath, "node_modules");
  const prebuilds = path.join(modules, "node-pty", "prebuilds");
  for (const dir of fs.readdirSync(prebuilds)) {
    if (dir === `darwin-${arch}`) continue;
    fs.rmSync(path.join(prebuilds, dir), { recursive: true });
  }
  for (const dir of [
    "node-pty/deps",
    "node-pty/src",
    "node-pty/third_party",
    "@parcel/watcher/src",
    "@parcel/watcher/build",
    "node-addon-api",
  ]) {
    fs.rmSync(path.join(modules, dir), { recursive: true, force: true });
  }
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
      NSLocationUsageDescription:
        "Websites you open in Conduit can use your location.",
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
    packageAfterCopy: async (
      _,
      buildPath,
      electronVersion,
      _platform,
      arch,
    ) => {
      execFileSync("bun", ["add", "--no-save", ...lockedNativeModuleSpecs()], {
        cwd: buildPath,
        stdio: "inherit",
      });
      buildPatchedWatcher(buildPath, electronVersion, arch);
      pruneNativeModules(buildPath, arch);
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
