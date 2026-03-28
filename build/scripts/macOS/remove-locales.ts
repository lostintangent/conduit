import fs from "node:fs";
import path from "node:path";

const keepLocales = ["en.lproj", "en_US.lproj"];

export function removeUnusedLocales(outputPath: string, platform: string) {
  if (platform !== "darwin") return;

  // outputPath is the directory containing Conduit.app
  const appPath = path.join(outputPath, "Conduit.app");
  const localesPath = path.join(
    appPath,
    "Contents",
    "Frameworks",
    "Electron Framework.framework",
    "Versions",
    "A",
    "Resources",
  );

  if (!fs.existsSync(localesPath)) {
    console.log("⚠️  Locales path not found:", localesPath);
    return;
  }

  const items = fs.readdirSync(localesPath);
  let removedCount = 0;
  let savedSize = 0;

  items.forEach((item) => {
    if (item.endsWith(".lproj") && !keepLocales.includes(item)) {
      const itemPath = path.join(localesPath, item);
      try {
        const size = getDirectorySize(itemPath);
        fs.rmSync(itemPath, { recursive: true, force: true });
        savedSize += size;
        removedCount++;
      } catch (error) {
        console.error(`Error removing ${item}:`, error.message);
      }
    }
  });

  if (removedCount > 0) {
    console.log(
      `✓ Removed ${removedCount} unused locale(s), saved ~${(savedSize / 1024 / 1024).toFixed(1)}MB`,
    );
  }
}

function getDirectorySize(dirPath: string): number {
  let size = 0;
  try {
    const items = fs.readdirSync(dirPath);
    items.forEach((item) => {
      const itemPath = path.join(dirPath, item);
      const stats = fs.statSync(itemPath);
      if (stats.isDirectory()) {
        size += getDirectorySize(itemPath);
      } else {
        size += stats.size;
      }
    });
  } catch (error) {
    // Ignore errors
  }
  return size;
}
