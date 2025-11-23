/**
 * Import dependency finder module.
 * 
 * This module provides functionality to find all source files that import
 * or re-export a specific target file, supporting ES6 imports, CommonJS require,
 * dynamic imports, and re-exports (export * from, export { } from).
 * 
 * @module core/find-includes
 */

import fs from 'fs';
import path from 'path';
import ts from 'typescript';

/**
 * Finds all source files that import or re-export a specific target file.
 * This function operates *entirely* on paths relative to the projectRoot,
 * avoiding absolute path comparison issues by normalizing all paths
 * before comparison.
 *
 * @param targetFileRelativePath The path to the target file, *relative* to the project root.
 * @param projectRoot The *absolute* path to the project root.
 * @param allSourceFiles An array of *absolute* paths to all .ts files to search through.
 * @returns An array of *absolute* file paths (string[]) that import or re-export the target file.
 */
export function findFilesImportingTarget(
  targetFileRelativePath: string,
  projectRoot: string,
  allSourceFiles: string[]
): string[] {
  
  const affectedFiles: string[] = [];

  // 1. Create the set of valid *NORMALIZED RELATIVE* paths to match.
  const validTargetPaths = new Set<string>();
  
  const normalizedTargetRelativePath = path.normalize(targetFileRelativePath).replace(/\\/g, '/');
  
  const targetParsedPath = path.parse(normalizedTargetRelativePath);
  const targetDir = targetParsedPath.dir; // e.g., 'src/exports'
  const targetName = targetParsedPath.name; // e.g., 'gamefunctions' or 'dbuser'

  // Path 1: "src/exports/gamefunctions" (explicit file import)
  const explicitPath = path.normalize(path.join(targetDir, targetName)).replace(/\\/g, '/');
  validTargetPaths.add(explicitPath);

  // Path 2: "src/exports" (implicit 'index.ts' import)
  if (targetName === 'index') {
    validTargetPaths.add(path.normalize(targetDir).replace(/\\/g, '/'));
  }

  // --- Analysis Starts Here ---
  const absoluteTarget = path.join(projectRoot, normalizedTargetRelativePath);

  for (const absoluteFileToAnalyze of allSourceFiles) {
    if (absoluteFileToAnalyze === absoluteTarget) {
      continue;
    }

    let sourceFile: ts.SourceFile;
    try {
      const content = fs.readFileSync(absoluteFileToAnalyze, 'utf8');
      sourceFile = ts.createSourceFile(
        absoluteFileToAnalyze,
        content,
        ts.ScriptTarget.ESNext
      );
    } catch (e: any) {
      console.warn(`[FIRE-DIFF Warning] Could not read or parse file: ${absoluteFileToAnalyze}. Skipping.`);
      continue;
    }

    let fileImportsTarget = false;
    
    const fileRelativePath = path.relative(projectRoot, absoluteFileToAnalyze);
    const fileRelativeDir = path.dirname(fileRelativePath);

    function searchNode(node: ts.Node) {
      if (fileImportsTarget) return;

      let importString: string | undefined = undefined;

      // Case 1: ES6 Static Import
      if (ts.isImportDeclaration(node)) {
        importString = (node.moduleSpecifier as ts.StringLiteral).text;
      }
      // Case 2: CommonJS Require
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require'
      ) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          importString = arg.text;
        }
      }
      // Case 3: ES6 Dynamic Import
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          importString = arg.text;
        }
      }
      // Case 4: Re-export (export * from './path')
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        if (ts.isStringLiteral(node.moduleSpecifier)) {
          importString = node.moduleSpecifier.text;
        }
      }
      // Case 5: Named re-export (export { name } from './path')
      if (
        ts.isExportDeclaration(node) &&
        node.exportClause &&
        ts.isNamedExports(node.exportClause) &&
        node.moduleSpecifier
      ) {
        if (ts.isStringLiteral(node.moduleSpecifier)) {
          importString = node.moduleSpecifier.text;
        }
      }

      if (importString) {
        
        const resolvedRelativePath = path.normalize(path.join(fileRelativeDir, importString))
                                         .replace(/\\/g, '/');

        // Compare (Normalized vs Normalized)
        if (validTargetPaths.has(resolvedRelativePath)) {
          fileImportsTarget = true;
        }
      }

      if (!fileImportsTarget) {
        ts.forEachChild(node, searchNode);
      }
    }

    searchNode(sourceFile);

    if (fileImportsTarget) {
      affectedFiles.push(absoluteFileToAnalyze);
    }
  }

  return [...new Set(affectedFiles)];
}