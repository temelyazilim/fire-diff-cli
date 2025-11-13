#!/usr/bin/env node

/**
 * FIRE-DIFF-CLI (Find Affected Endpoints)
 * 
 * CLI tool to find affected Firebase Cloud Functions endpoints
 * based on git changes in the codebase.
 * 
 * @module cli
 */

import { FaeptsAnalyzer } from './core/analyzer';
import { DeployMaker } from './core/deploy-maker';
import { GitChangeAnalyzer } from './utils/git-analyzer';

// -------------------------------------------------------------------------
// Main Execution
// -------------------------------------------------------------------------

/**
 * Main entry point for the CLI application.
 * 
 * Analyzes git changes and determines which Firebase Cloud Functions
 * need to be redeployed based on affected dependencies.
 * 
 * Exit codes:
 * - 0: Success (affected functions found or no changes detected)
 * - 1: Error occurred during execution
 */
function main(): void {
  try {
    // Initialize the analyzer to build the project dependency graph
    const analyzer = new FaeptsAnalyzer();
    
    // Analyze git changes to find modified files
    const gitAnalyzer = new GitChangeAnalyzer(analyzer.topEntities, analyzer.root);
    const changedEntities = gitAnalyzer.getChangedEntities();

    // If no changes detected, exit gracefully
    if (changedEntities.length === 0) {
      console.log('[FIRE-DIFF] No relevant .ts file changes detected.');
      process.exit(0);
    }

    // Recursively find all functions affected by the changed files
    for (const seed of changedEntities) {
      analyzer.findAffectedFunctionsRecursive(seed);
    }

    // Generate deployment names based on affected endpoints
    const dm = new DeployMaker(analyzer.endPoints, analyzer.root);
    const deployNames = dm.getDeployNames();
    
    // Output the deployment names with headers
    if (deployNames.length > 0) {
      // List format: one per line
      console.log('Affected endpoints:');
      console.log('-------------------');
      console.log(deployNames.join('\n'));
      console.log('');
      
      // Single line format: ready to deploy (Firebase format)
      console.log('Ready to deploy:');
      console.log('----------------');
      const deployCommand = `firebase deploy --only ${deployNames.map(name => `functions:${name}`).join(',')}`;
      console.log(deployCommand);
      console.log("");
    } else {
      console.log('[FIRE-DIFF] No affected endpoints found.');
    }
    
    process.exit(0);
  } catch (error) {
    // Handle any errors gracefully with user-friendly messages
    console.error('[FIRE-DIFF] Error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('[FIRE-DIFF] Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the main function
main();