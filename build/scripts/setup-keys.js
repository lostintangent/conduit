#!/usr/bin/env node

/**
 * Setup SSH keys for Conduit VM connections
 * Creates keys/ directory and generates SSH key pair if they don't exist
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PROJECT_ROOT = path.join(__dirname, "..", "..");
const KEYS_DIR = path.join(PROJECT_ROOT, "keys");
const PRIVATE_KEY = path.join(KEYS_DIR, "id_rsa");
const PUBLIC_KEY = path.join(KEYS_DIR, "id_rsa.pub");

console.log("🔑 Setting up SSH keys for Conduit...");

// Create keys directory if it doesn't exist
if (!fs.existsSync(KEYS_DIR)) {
  console.log("📁 Creating keys/ directory...");
  fs.mkdirSync(KEYS_DIR, { recursive: true });
}

// Check if keys already exist
if (fs.existsSync(PRIVATE_KEY) && fs.existsSync(PUBLIC_KEY)) {
  console.log("✅ SSH keys already exist in keys/ directory");
  process.exit(0);
}

// Generate SSH keys
console.log("🔨 Generating SSH key pair...");

try {
  // Generate SSH key with no passphrase
  execSync(
    `ssh-keygen -t rsa -b 4096 -f "${PRIVATE_KEY}" -N "" -C "conduit-vm-key"`,
    { stdio: "inherit" },
  );

  // Set appropriate permissions
  if (process.platform !== "win32") {
    fs.chmodSync(PRIVATE_KEY, 0o600);
    fs.chmodSync(PUBLIC_KEY, 0o644);
  }

  console.log("✅ SSH keys generated successfully!");
  console.log(`   Private key: ${PRIVATE_KEY}`);
  console.log(`   Public key:  ${PUBLIC_KEY}`);
  console.log("");
  console.log("🎉 Conduit is ready to connect to cloud VMs!");
} catch (error) {
  console.error("❌ Failed to generate SSH keys:", error.message);
  console.error("");
  console.error("You can manually create keys by running:");
  console.error(
    `  ssh-keygen -t rsa -b 4096 -f "${PRIVATE_KEY}" -N "" -C "conduit-vm-key"`,
  );
  process.exit(1);
}
