const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const assetDir = path.resolve(__dirname, "../assets");
const iconPng = path.join(assetDir, "icon.png");
const iconIcns = path.join(assetDir, "icon.icns");

if (process.platform !== "darwin") {
  process.exit(0);
}

// Skip generating the ICNS if the source PNG is older than the target ICNS
const sourceTime = fs.statSync(iconPng).mtimeMs;
if (fs.existsSync(iconIcns)) {
  const targetTime = fs.statSync(iconIcns).mtimeMs;
  if (targetTime >= sourceTime) {
    process.exit(0);
  }
}

const run = (command, args) =>
  execFileSync(command, args, { stdio: "inherit" });

const iconsetDir = path.join(assetDir, "icon.iconset");
const iconSpecs = [
  { size: 16, scale: 1 },
  { size: 16, scale: 2 },
  { size: 32, scale: 1 },
  { size: 32, scale: 2 },
  { size: 128, scale: 1 },
  { size: 128, scale: 2 },
  { size: 256, scale: 1 },
  { size: 256, scale: 2 },
  { size: 512, scale: 1 },
  { size: 512, scale: 2 },
];

fs.rmSync(iconsetDir, { recursive: true, force: true });
fs.mkdirSync(iconsetDir, { recursive: true });

for (const { size, scale } of iconSpecs) {
  const dimension = size * scale;
  const suffix = scale === 2 ? "@2x" : "";
  const filename = `icon_${size}x${size}${suffix}.png`;
  const output = path.join(iconsetDir, filename);

  run("sips", [
    "-z",
    String(dimension),
    String(dimension),
    iconPng,
    "--out",
    output,
  ]);
}

run("iconutil", ["-c", "icns", iconsetDir, "-o", iconIcns]);
console.log(`Generated ${iconIcns}`);

fs.rmSync(iconsetDir, { recursive: true, force: true });
