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
import { getProjectFiles } from '../utils/file-system';
import { findFilesImportingTarget } from './find-includes';
import { fileTopFunctions } from './find-top-functions'; 
import { getEndpointInfo } from './firebase-helpers';
import { AnalysisResult, AnalysisSeed, FileFunctionsResult } from './types';

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
        //console.warn(`[FIRE-DIFF Warning] Circular dependency detected: ${key}`);
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

      const entityMap = this.topEntities.find(e => e.path === affectedFilePath);
      if (!entityMap) continue;

      const sortedEntities = entityMap.funcs; 

      for (let i = 0; i < sortedEntities.length; i++) {
        const currentEntity = sortedEntities[i];
        if (!currentEntity) continue;

        if (affectedFilePath === baseData.path && currentEntity.fn === baseData.fn) {
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
            console.log(endpointInfo);
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
}