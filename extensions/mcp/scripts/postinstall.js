#!/usr/bin/env node
/**
 * Postinstall script to install mh (MCP Hub) binary
 * Reuses the official install script from mcphub repository
 */

import { execSync, spawnSync } from "node:child_process";

const INSTALL_SCRIPT_URL = "https://raw.githubusercontent.com/vaayne/mcphub/main/scripts/install.sh";

// Check if mh is already installed
function isMhInstalled() {
  const result = spawnSync("which", ["mh"], { encoding: "utf-8" });
  return result.status === 0;
}

// Main
function main() {
  // Skip if already installed
  if (isMhInstalled()) {
    console.log("✓ mh CLI already installed");
    return;
  }

  console.log("Installing mh (MCP Hub) CLI...");

  try {
    // Use the official install script
    execSync(`curl -fsSL "${INSTALL_SCRIPT_URL}" | sh`, {
      stdio: "inherit",
      shell: true,
    });
  } catch (error) {
    console.error(`\n⚠ Failed to install mh: ${error.message}`);
    console.error("  You can install it manually:");
    console.error(`    curl -fsSL ${INSTALL_SCRIPT_URL} | sh`);
  }
}

main();
