/**
 * Core analyzer module for dependency analysis.
 * 
 * This module provides the main analyzer class that builds dependency graphs
 * and recursively finds affected functions based on code changes.
 * 
 * @module core/analyzer
 */

import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { getProjectFiles } from '../utils/file-system';
import { findFilesImportingTarget } from './find-includes';
import { fileTopFunctions } from './find-top-functions'; 
import { getEndpointInfo } from './firebase-helpers';
import { AnalysisResult, AnalysisSeed, FileFunctionsResult } from './types';

/**
 * Result of checking if a file re-exports the target file.
 */
interface ReExportInfo {
  /** The absolute path of the re-exported file. */
  path: string;
  /** 
   * Names of exported functions (for named exports like export { name } from).
   * null means export * from (all functions are exported).
   */
  exportedNames: string[] | null;
}

/**
 * Main analyzer class that performs recursive dependency analysis.
 * 
 * Analyzes the project structure, builds a dependency graph, and finds
 * all functions affected by changes in the codebase. Uses caching and
 * recursive traversal to efficiently track dependencies.
 * 
 * @class FaeptsAnalyzer
 */
export class FaeptsAnalyzer {
  /** Project root directory path. */
  public root: string;
  /** All TypeScript source file paths in the project. */
  public files: string[];
  /** Top-level entities (functions, classes, etc.) found in each file. */
  public topEntities: FileFunctionsResult[];
  /** Affected Firebase Cloud Functions endpoints. */
  public endPoints: AnalysisSeed[];
  
  /** File content cache to avoid repeated file system reads. */
  private fileContentCache: Map<string, string> = new Map();
  /** Analysis results for each function/entity. */
  public analysisChecklist: Map<string, AnalysisResult>;

  /**
   * Creates the analyzer instance.
   * 
   * Initializes the analyzer by scanning the project for all TypeScript files
   * and building a map of top-level entities (functions, classes, etc.) in each file.
   */
  constructor() {
    const { projectRoot, allFiles } = getProjectFiles();
    this.root = projectRoot;
    this.files = allFiles;

    this.topEntities = this.files.map(file => {
      return fileTopFunctions(file);
    });
    
    this.analysisChecklist = new Map<string, AnalysisResult>();
    this.endPoints = [];
  }

  /**
   * Gets the full text content of a file, using a cache.
   * 
   * @param filePath Absolute path to the file.
   * @returns File content or undefined if read fails.
   */
  private getFileContent(filePath: string): string | undefined {
    if (this.fileContentCache.has(filePath)) {
      return this.fileContentCache.get(filePath);
    }
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      this.fileContentCache.set(filePath, content);
      return content;
    } catch (e) {
      console.warn(`[FIRE-DIFF Warning] Could not read file: ${filePath}. Skipping.`);
      return undefined;
    }
  }

  /**
   * Starts or continues the recursive analysis from a single "seed" change.
   * Accumulates results in the global checklist.
   * 
   * @param baseData Seed entity (function/class) to start analysis from.
   * @returns Map of all analysis results, keyed by "{path}#{functionName}".
   */
  public findAffectedFunctionsRecursive(baseData: AnalysisSeed): Map<string, AnalysisResult> {
    this._recursiveAnalyze(baseData);
    
    return this.analysisChecklist;
  }

  /**
   * Core recursive worker: check cache, run analysis, recurse.
   * Uses the 'checked' flag (false/true) to manage state.
   * 
   * @param baseData Entity to analyze recursively.
   */
  private _recursiveAnalyze(baseData: AnalysisSeed): void {
    const key = `${baseData.path}#${baseData.fn}`;

    if (this.analysisChecklist.has(key)) {
      const existingEntry = this.analysisChecklist.get(key);
      
      if (existingEntry?.checked === true) {
        return; 
      }
      
      if (existingEntry?.checked === false) {
        return;
      }
    }

    this.analysisChecklist.set(key, {
      fn: baseData.fn,
      path: baseData.path,
      checked: false,
      result: []
    });

    const directDependents = this.findDirectDependents(baseData);

    for (const dependent of directDependents) {
      this._recursiveAnalyze(dependent);
    }

    this.analysisChecklist.set(key, {
      fn: baseData.fn,
      path: baseData.path,
      checked: true, 
      result: directDependents
    });
  }

  /**
   * Finds only the direct dependents (one level deep) for a given seed,
   * using the "block search" logic.
   * Also handles re-exports: if a file re-exports the changed file,
   * it directly adds endpoints from the re-exported file.
   * 
   * @param baseData Seed entity to find direct dependents for.
   * @returns Array of direct dependent entities (functions/classes that use the seed).
   */
  private findDirectDependents(baseData: AnalysisSeed): AnalysisSeed[] {
    const affectedFunctions: AnalysisSeed[] = [];
    const targetRelativePath = path.relative(this.root, baseData.path);

    const importingFiles = findFilesImportingTarget(
      targetRelativePath,
      this.root,
      this.files
    );
    
    importingFiles.push(baseData.path);

    for (const affectedFilePath of importingFiles) {
      const fileContent = this.getFileContent(affectedFilePath);
      if (!fileContent) continue;

      // Check if this file re-exports the target file
      const reExportInfo = this.findReExportedInfo(affectedFilePath, baseData.path);
      if (reExportInfo) {
        // If re-exported, check which functions are exported
        // Only add the changed function (baseData.fn) if it's exported
        const reExportedEntityMap = this.topEntities.find(e => e.path === reExportInfo.path);
        if (reExportedEntityMap) {
          // Check if the changed function (baseData.fn) is exported
          let shouldIncludeFunction = false;
          
          if (reExportInfo.exportedNames === null) {
            // Wildcard export (export * from): all functions are exported
            // But we still only include the changed function (baseData.fn)
            shouldIncludeFunction = true;
          } else {
            // Named export (export { name } from): only if the changed function is in the list
            shouldIncludeFunction = reExportInfo.exportedNames.includes(baseData.fn);
          }
          
          if (shouldIncludeFunction) {
            // Find the specific function that changed (baseData.fn)
            const changedEntity = reExportedEntityMap.funcs.find(e => e.fn === baseData.fn);
            if (changedEntity) {
              const reExportedFileContent = this.getFileContent(reExportInfo.path);
              if (reExportedFileContent) {
                const sortedEntities = reExportedEntityMap.funcs;
                const entityIndex = sortedEntities.indexOf(changedEntity);
                const start = changedEntity.start;
                const nextEntity = sortedEntities[entityIndex + 1];
                const end = nextEntity ? nextEntity.start : reExportedFileContent.length;
                
                const blockContent = reExportedFileContent.substring(start, end);
                const endpointInfo = getEndpointInfo(blockContent);
                
                if (endpointInfo.isEndpoint === true) {
                  const tmpFunc = {
                    fn: changedEntity.fn,
                    path: reExportInfo.path
                  };
                  
                  if (!this.endPoints.some(e => e.path === tmpFunc.path && e.fn === tmpFunc.fn)) {
                    this.endPoints.push(tmpFunc);
                  }
                  
                  affectedFunctions.push(tmpFunc);
                }
              }
            }
          }
        }
        // Skip normal dependency check for re-exported files to avoid duplicate processing
        // The re-exported file's functions are already handled above
        if (reExportInfo.path === baseData.path) {
          continue;
        }
      }

      // Skip normal dependency check if this file was re-exported
      // (re-exported files are already handled in the re-export check above)
      const isReExportedFile = reExportInfo && reExportInfo.path === affectedFilePath;
      if (isReExportedFile) {
        continue;
      }

      const entityMap = this.topEntities.find(e => e.path === affectedFilePath);
      if (!entityMap) continue;

      const sortedEntities = entityMap.funcs; 

      for (let i = 0; i < sortedEntities.length; i++) {
        const currentEntity = sortedEntities[i];
        if (!currentEntity) continue;

        // If this is the changed file itself, only check the changed function
        // (not all functions in the file)
        if (affectedFilePath === baseData.path && currentEntity.fn !== baseData.fn) {
          continue;
        }
        
        const start = currentEntity.start;
        const nextEntity = sortedEntities[i + 1];
        const end = nextEntity ? nextEntity.start : fileContent.length; 

        const blockContent = fileContent.substring(start, end);
        
        if (blockContent.includes(baseData.fn)) {
          const endpointInfo = getEndpointInfo(blockContent);
          const tmpFunc = {
            fn: currentEntity.fn,
            path: affectedFilePath
          };
          
          if (endpointInfo.isEndpoint === true) {
             if (!this.endPoints.some(e => e.path === tmpFunc.path && e.fn === tmpFunc.fn)) {
               this.endPoints.push(tmpFunc);
             }
          }
          
          affectedFunctions.push(tmpFunc);
        }
      }
    }
    
    const uniqueResults = new Map<string, AnalysisSeed>();
    for (const func of affectedFunctions) {
      const key = `${func.path}#${func.fn}`;
      uniqueResults.set(key, func);
    }
    
    return Array.from(uniqueResults.values());
  }

  /**
   * Checks if a file re-exports the target file.
   * Returns information about the re-export including which functions are exported.
   * 
   * @param filePath The file to check for re-exports.
   * @param targetPath The target file path that should be re-exported.
   * @returns Re-export information, or null if not found.
   */
  private findReExportedInfo(filePath: string, targetPath: string): ReExportInfo | null {
    const fileContent = this.getFileContent(filePath);
    if (!fileContent) return null;

    let sourceFile: ts.SourceFile;
    try {
      sourceFile = ts.createSourceFile(
        filePath,
        fileContent,
        ts.ScriptTarget.ESNext
      );
    } catch (e) {
      return null;
    }

    const fileDir = path.dirname(filePath);
    const targetPathWithoutExt = targetPath.replace(/\.ts$/, '');
    const targetPathNormalized = path.normalize(targetPathWithoutExt).replace(/\\/g, '/');

    let reExportInfo: ReExportInfo | null = null;

    function searchNode(node: ts.Node) {
      if (reExportInfo) return;

      // Check for export * from './path' or export { name } from './path'
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        if (ts.isStringLiteral(node.moduleSpecifier)) {
          const exportPath = node.moduleSpecifier.text;
          
          // Try with .ts extension
          let resolvedPath = path.resolve(fileDir, exportPath + '.ts');
          let resolvedPathNormalized = path.normalize(resolvedPath.replace(/\.ts$/, '')).replace(/\\/g, '/');
          
          if (resolvedPathNormalized === targetPathNormalized) {
            // Check if it's a named export (export { name } from) or wildcard export (export * from)
            if (node.exportClause && ts.isNamedExports(node.exportClause)) {
              // Named export: export { name1, name2 } from './path'
              const exportedNames: string[] = [];
              for (const element of node.exportClause.elements) {
                if (ts.isIdentifier(element.name)) {
                  exportedNames.push(element.name.text);
                }
              }
              reExportInfo = {
                path: targetPath,
                exportedNames: exportedNames.length > 0 ? exportedNames : null
              };
            } else {
              // Wildcard export: export * from './path'
              reExportInfo = {
                path: targetPath,
                exportedNames: null // null means all functions
              };
            }
            return;
          }
          
          // Try without extension (if exportPath already has it)
          resolvedPath = path.resolve(fileDir, exportPath);
          resolvedPathNormalized = path.normalize(resolvedPath.replace(/\.ts$/, '')).replace(/\\/g, '/');
          
          if (resolvedPathNormalized === targetPathNormalized) {
            // Check if it's a named export (export { name } from) or wildcard export (export * from)
            if (node.exportClause && ts.isNamedExports(node.exportClause)) {
              // Named export: export { name1, name2 } from './path'
              const exportedNames: string[] = [];
              for (const element of node.exportClause.elements) {
                if (ts.isIdentifier(element.name)) {
                  exportedNames.push(element.name.text);
                }
              }
              reExportInfo = {
                path: targetPath,
                exportedNames: exportedNames.length > 0 ? exportedNames : null
              };
            } else {
              // Wildcard export: export * from './path'
              reExportInfo = {
                path: targetPath,
                exportedNames: null // null means all functions
              };
            }
            return;
          }
        }
      }

      if (!reExportInfo) {
        ts.forEachChild(node, searchNode);
      }
    }

    searchNode(sourceFile);
    return reExportInfo;
  }
}