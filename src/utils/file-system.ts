/**
 * File system utilities module.
 * 
 * This module provides utilities for finding and processing TypeScript files
 * in the project, including path normalization and file discovery.
 * 
 * @module utils/file-system
 */

import { globSync } from 'glob';
import path from 'path';
import fs from 'fs';

/**
 * (Internal Worker Function)
 * Finds all .ts source files in a given project directory,
 * respecting common ignore patterns.
 *
 * @param projectPath The absolute path to the root of the project to scan.
 * @returns An array of absolute file paths (string[]).
 */
function getSourceFiles(projectPath: string): string[] {
  // Pattern to find all TypeScript files
  const tsFilePattern = path.join(projectPath, '**/*.ts');

  // Patterns to ignore common build, dependency, and test directories/files
  // Use **/ pattern to ignore at any directory level
  const ignorePattern = [
    '**/node_modules/**',  // Ignore dependencies at any level
    '**/dist/**',          // Ignore built output at any level
    '**/src/__tests__/**', // Ignore __tests__ directory at any level
    '**/*.test.ts',       // Ignore files ending in .test.ts
    '**/*.spec.ts',       // Ignore files ending in .spec.ts
  ];

  const allFiles = globSync(tsFilePattern, {
    ignore: ignorePattern,
    absolute: true,
  });

  return allFiles;
}

/**
 * Finds firebase.json file starting from the current working directory
 * and searching upward in the directory tree.
 *
 * @returns An object with configPath and firebaseRoot, or null if not found.
 */
function findFirebaseConfig(): { configPath: string; firebaseRoot: string } | null {
  let currentDir = process.cwd();
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const configPath = path.join(currentDir, 'firebase.json');
    if (fs.existsSync(configPath)) {
      return {
        configPath,
        firebaseRoot: currentDir,
      };
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * Extracts function source directories from firebase.json configuration.
 *
 * @param firebaseConfig The parsed firebase.json object.
 * @param firebaseRoot The absolute path to the Firebase project root.
 * @returns An array of absolute paths to function source directories.
 */
function getFunctionsSources(firebaseConfig: any, firebaseRoot: string): string[] {
  const sources: string[] = [];

  if (Array.isArray(firebaseConfig.functions)) {
    // Multiple functions directories
    for (const funcConfig of firebaseConfig.functions) {
      if (funcConfig.source) {
        const sourcePath = path.resolve(firebaseRoot, funcConfig.source);
        if (fs.existsSync(sourcePath)) {
          sources.push(sourcePath);
        }
      }
    }
  } else if (firebaseConfig.functions?.source) {
    // Single functions directory
    const sourcePath = path.resolve(firebaseRoot, firebaseConfig.functions.source);
    if (fs.existsSync(sourcePath)) {
      sources.push(sourcePath);
    }
  }

  return sources;
}

/**
 * Gets the project's absolute root path ("World") AND a list of all
 * .ts files within that world.
 *
 * The function first tries to find firebase.json to determine function
 * source directories. If found and contains multiple function sources,
 * it scans each one separately. Otherwise, it uses the current working
 * directory as the project root.
 *
 * @returns An object: { projectRoot: string, allFiles: string[] }
 */
export function getProjectFiles(): { projectRoot: string; allFiles: string[] } {
  const configInfo = findFirebaseConfig();

  // If firebase.json exists, check for multiple function sources
  if (configInfo) {
    try {
      const configContent = fs.readFileSync(configInfo.configPath, 'utf8');
      const firebaseConfig = JSON.parse(configContent);

      const functionSources = getFunctionsSources(firebaseConfig, configInfo.firebaseRoot);

      if (functionSources.length > 0) {
        // Scan each function source directory separately
        const allFiles: string[] = [];
        for (const sourcePath of functionSources) {
          const files = getSourceFiles(sourcePath);
          allFiles.push(...files);
        }

        // Use the first function source as projectRoot (for backward compatibility)
        // or use firebaseRoot if no sources found
        const projectRoot = functionSources[0] || configInfo.firebaseRoot;

        return { projectRoot, allFiles };
      }
    } catch (e) {
      // If parsing fails, fall through to default behavior
    }
  }

  // Default behavior: use current working directory
  const projectRoot = process.cwd();
  const allFiles = getSourceFiles(projectRoot);

  return { projectRoot, allFiles };
}

/**
 * Cleans the raw file path input from the CLI.
 * It handles cases where the user copy-pastes a path that includes
 * the root folder name (e.g., "functions/src/file.ts").
 *
 * @param rawTargetFromCLI The raw string from process.argv[2].
 * @param projectRoot The absolute path to the project root.
 * @returns A clean, relative file path (e.g., "src/file.ts").
 */
export function normalizeCliInput(rawTargetFromCLI: string, projectRoot: string): string {
  let targetFileRelativePath = rawTargetFromCLI;
  
  // Get the name of the root folder (e.g., "functions")
  const rootFolderName = path.basename(projectRoot); 
  
  // If the pasted path starts with the root folder name, strip it.
  if (targetFileRelativePath.startsWith(`${rootFolderName}/`)) {
    targetFileRelativePath = targetFileRelativePath.substring(
      rootFolderName.length + 1
    );
  }
  
  // Return the normalized, relative path
  return targetFileRelativePath.replace(/\\/g, '/');
}

/**
 * Formats the list of absolute affected file paths into relative paths
 * for clean console output.
 *
 * @param affectedFiles An array of absolute file paths.
 * @param projectRoot The absolute path to the project root.
 * @returns An array of relative file paths (e.g., ["src/index.ts"]).
 */
export function formatOutputPaths(affectedFiles: string[], projectRoot: string): string[] {
  if (!affectedFiles || affectedFiles.length === 0) {
    return [];
  }
  
  // Convert each absolute path back to a relative path for display
  return affectedFiles.map((file) =>
    path.relative(projectRoot, file).replace(/\\/g, '/')
  );
}