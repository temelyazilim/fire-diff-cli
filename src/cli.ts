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
import { GitChangeAnalyzer } from './utils/git-analyzer';
import { EndPointLister } from './core/endpoint-lister';
import { EndpointListResult } from './core/types';
import { DeployMaker } from './core/deploy-maker';
import { groupEndpointsByPathAndVersion } from './utils/endpoint-formatter';

/**
 * Analyzes git changes and determines which Firebase Cloud Functions
 * need to be redeployed based on affected dependencies.
 * 
 * Exit codes:
 * - 0: Success (affected functions found or no changes detected)
 * - 1: Error occurred during execution
 */

function analysisProcedure(): void {
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
        const deployNamesV1 = dm.getDeployNamesByVersion('v1');
        const deployNamesV2 = dm.getDeployNamesByVersion('v2');
        
        // Output the deployment names with headers, separated by version
        const hasV1 = deployNamesV1.length > 0;
        const hasV2 = deployNamesV2.length > 0;
        
        if (hasV1 || hasV2) {
            // V1 endpoints output
            if (hasV1) {
                console.log('Affected endpoints (v1):');
                console.log('----------------------');
                console.log(deployNamesV1.join('\n'));
                console.log('');
                
                console.log('Ready to deploy (v1):');
                console.log('---------------------');
                const deployCommandV1 = `firebase deploy --only ${deployNamesV1.map(name => `functions:${name}`).join(',')}`;
                console.log(deployCommandV1);
                console.log("");
            }
            
            // V2 endpoints output
            if (hasV2) {
                console.log('Affected endpoints (v2):');
                console.log('----------------------');
                console.log(deployNamesV2.join('\n'));
                console.log('');
                
                console.log('Ready to deploy (v2):');
                console.log('---------------------');
                const deployCommandV2 = `firebase deploy --only ${deployNamesV2.map(name => `functions:${name}`).join(',')}`;
                console.log(deployCommandV2);
                console.log("");
            }
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

/**
 * Runs the "List All Endpoints" feature.
 * This is independent of git changes.
 * 
 * @param jsonOutput If true, outputs results in JSON format.
 * 
 * Exit codes:
 * - 0: Success (endpoints listed or none found)
 * - 1: Error occurred during execution
 */
function listProcedure(jsonOutput: boolean = false): void {
  try {
    if (!jsonOutput) {
      console.log('[FIRE-DIFF] Listing all endpoints in the project...');
    }

    const lister = new EndPointLister();
    
    const allEndpoints = lister.listAllEndpoints();
    if (allEndpoints.length === 0) {
      if (jsonOutput) {
        console.log(JSON.stringify([], null, 2));
      } else {
        console.log('[FIRE-DIFF] No endpoints found in this project.');
      }
      process.exit(0);
    }

    if (jsonOutput) {
      const grouped = groupEndpointsByPathAndVersion(allEndpoints);
      console.log(JSON.stringify(grouped, null, 2));
      process.exit(0);
    }

    const groupedByPath = new Map<string, EndpointListResult[]>();
    for (const endpoint of allEndpoints) {
      if (!groupedByPath.has(endpoint.path)) {
        groupedByPath.set(endpoint.path, []);
      }
      groupedByPath.get(endpoint.path)?.push(endpoint);
    }

    groupedByPath.forEach((endpoints, filePath) => {
      console.log('--------------------------------------------');
      console.log(`| ${filePath}`);
      console.log('--------------------------------------------');
      for (const ep of endpoints) {
        console.log(`${ep.deployname} (${ep.name}) [${ep.kind} - ${ep.version}]`);
      }
    });
    console.log('--------------------------------------------');
    
    process.exit(0);
  } catch (error) {
    console.error('[FIRE-DIFF] Error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('[FIRE-DIFF] Stack trace:', error.stack);
    }
    process.exit(1);
  }
}


/**
 * Displays help information.
 */
function showHelp(): void {
  console.log(`
Usage: fire-diff [command] [options]

Commands:
  analyze              Analyze git changes and find affected endpoints (default)
  endpoints            List all Firebase Functions endpoints in the project

Options:
  --json               Output results in JSON format (endpoints command only)
  --help, -h           Show this help message

Examples:
  fire-diff                           # Analyze git changes (default)
  fire-diff analyze                   # Same as above
  fire-diff endpoints                 # List all endpoints
  fire-diff endpoints --json          # List all endpoints in JSON format
  fire-diff --help                    # Show help

For more information, visit: https://github.com/temelyazilim/fire-diff-cli
`);
}

/**
 * Parses command line arguments and routes to appropriate procedure.
 */
function parseArgs(): void {
  const args = process.argv.slice(2);

  // Global flags (can appear before or after command)
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  // Get command (first non-flag argument)
  const command = args.find(arg => !arg.startsWith('--') && !arg.startsWith('-')) || 'analyze';

  // Parse flags
  const jsonOutput = args.includes('--json');

  // Route to appropriate procedure
  switch (command) {
    case 'endpoints':
      listProcedure(jsonOutput);
      break;
    case 'analyze':
      if (jsonOutput) {
        console.error('[FIRE-DIFF] Error: --json flag is only supported with "endpoints" command.');
        process.exit(1);
      }
      analysisProcedure();
      break;
    default:
      console.error(`[FIRE-DIFF] Error: Unknown command "${command}".`);
      console.error('[FIRE-DIFF] Run "fire-diff --help" for usage information.');
      process.exit(1);
  }
}

/**
 * Main entry point for the CLI application.
 */
function main(): void {
  parseArgs();
}

// Run the main function
main();