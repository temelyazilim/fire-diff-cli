#!/usr/bin/env node

/**
 * Setup utility module.
 * 
 * This module provides a setup command to automatically add the fire-diff
 * script to the user's package.json file.
 * 
 * @module setup
 */

import fs from 'fs';
import path from 'path';

/**
 * Main setup function that adds the fire-diff script to package.json.
 */
function main(): void {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');

    // Check if package.json exists
    if (!fs.existsSync(packageJsonPath)) {
      console.error('[FIRE-DIFF] Error: package.json not found in current directory.');
      process.exit(1);
    }

    // Read package.json
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonContent);

    // Initialize scripts if it doesn't exist
    if (!packageJson.scripts) {
      packageJson.scripts = {};
    }

    // Check if script already exists
    if (packageJson.scripts.affected) {
      console.log('[FIRE-DIFF] Script "affected" already exists in package.json.');
      console.log('[FIRE-DIFF] Current value:', packageJson.scripts.affected);
      process.exit(0);
    }

    // Add the script
    packageJson.scripts.affected = 'fire-diff';

    // Write back to package.json with proper formatting
    const updatedContent = JSON.stringify(packageJson, null, 2) + '\n';
    fs.writeFileSync(packageJsonPath, updatedContent, 'utf8');

    console.log('[FIRE-DIFF] ✓ Successfully added "affected" script to package.json');
    console.log('[FIRE-DIFF] You can now run: npm run affected');
    process.exit(0);
  } catch (error) {
    console.error('[FIRE-DIFF] Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the setup
main();

