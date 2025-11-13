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
  const ignorePattern = [
    path.join(projectPath, 'node_modules/**'), // Ignore dependencies
    path.join(projectPath, 'dist/**'),          // Ignore built output
    path.join(projectPath, 'src/__tests__/**'), // Ignore __tests__ directory (as requested)
    path.join(projectPath, '**/*.test.ts'),     // Ignore files ending in .test.ts
    path.join(projectPath, '**/*.spec.ts'),     // Ignore files ending in .spec.ts
  ];

  const allFiles = globSync(tsFilePattern, {
    ignore: ignorePattern,
    absolute: true,
  });

  return allFiles;
}

/**
 * Gets the project's absolute root path ("World") AND a list of all
 * .ts files within that world.
 *
 * The "World" (projectRoot) is assumed to be the Current Working Directory
 * (process.cwd()) from which the 'faepts' command is executed.
 *
 * @returns An object: { projectRoot: string, allFiles: string[] }
 */
export function getProjectFiles(): { projectRoot: string; allFiles: string[] } {
  
  // 1. The "World" (Project Root) is the directory where the command is run.
  const projectRoot = process.cwd();
  
  // 2. Find all files within that "World".
  const allFiles = getSourceFiles(projectRoot);

  // 3. Return both the "World" and the "Files".
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