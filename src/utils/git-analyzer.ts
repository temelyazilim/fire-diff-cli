/**
 * Git change analyzer module.
 * 
 * This module analyzes git diff output to identify which top-level entities
 * (functions, classes, etc.) have been modified in the codebase.
 * 
 * @module utils/git-analyzer
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { AnalysisSeed, FileFunctionsResult, TopLevelEntity } from '../core/types';

/**
 * Analyzes 'git diff' output against the pre-built entity map
 * to find which top-level entities have been changed.
 * 
 * @class GitChangeAnalyzer
 */
export class GitChangeAnalyzer {
  /** Map of file paths to their top-level entities. */
  private topEntitiesMap: Map<string, FileFunctionsResult>;
  /** Project root directory path. */
  private projectRoot: string;
  /** File content cache to avoid repeated file system reads. */
  private fileContentCache: Map<string, string> = new Map();

  /**
   * Creates the Git analyzer.
   * @param topEntities The "reference map" (Map) from FaeptsAnalyzer.
   * @param projectRoot The absolute path to the project root.
   */
  constructor(topEntities: FileFunctionsResult[], projectRoot: string) {
    this.projectRoot = projectRoot;
    
    this.topEntitiesMap = new Map();
    for (const entityFile of topEntities) {
      this.topEntitiesMap.set(entityFile.path, entityFile);
    }
  }

  /**
   * Gets the full text content of a file, using a cache.
   * Must read from file system to capture unstaged changes that 'git diff HEAD' reports.
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
      console.warn(`[FIRE-DIFF Warning] Could not read file content for: ${filePath}. Skipping.`);
      return undefined;
    }
  }

  /**
   * Converts a 1-based line number (from git diff) into a 0-based character index.
   * 
   * @param content Full file content.
   * @param lineNumber 1-based line number from git diff.
   * @returns 0-based character index position.
   */
  private convertLineToCharIndex(content: string, lineNumber: number): number {
    const lines = content.split('\n');
    const targetLineIndex = lineNumber - 1; // Convert 1-based to 0-based
    let charIndex = 0;
    
    for (let i = 0; i < targetLineIndex; i++) {
      const line = lines[i];
      if (line !== undefined) {
        charIndex += line.length + 1; // +1 for the '\n'
      }
    }
    return charIndex;
  }

  /**
   * Finds the top-level entity that contains a given character position.
   * 
   * @param entityMap File's entity map containing all top-level entities.
   * @param position Character position to search for.
   * @returns Top-level entity containing the position, or undefined if not found.
   */
  private findEntityAtPosition(entityMap: FileFunctionsResult, position: number): TopLevelEntity | undefined {
    const sortedEntities = entityMap.funcs;
    
    for (let i = 0; i < sortedEntities.length; i++) {
      const currentEntity = sortedEntities[i];
      if (!currentEntity) continue;

      const nextEntity = sortedEntities[i + 1];
      const end = nextEntity ? nextEntity.start - 1 : Infinity;

      if (position >= currentEntity.start && position <= end) {
        return currentEntity;
      }
    }
    return undefined;
  }

  /**
   * Runs 'git diff' and analyzes the output to find all changed entities.
   * 
   * @returns Array of changed entities (functions, classes, etc.) found in git diff.
   */
  public getChangedEntities(): AnalysisSeed[] {
    const changedEntities = new Map<string, AnalysisSeed>();
    let currentFilePath: string | undefined = undefined;
    
    const diffCommand = 'git diff HEAD --relative --unified=0 -- "*.ts" ":(exclude)src/__tests__" ":(exclude)*.test.ts" ":(exclude)*.spec.ts"';
    
    let diffOutput: string;
    try {
      diffOutput = execSync(diffCommand, { cwd: this.projectRoot }).toString();
    } catch (e: any) {
      console.error(`[FIRE-DIFF Error] 'git diff' command failed.`);
      console.error(e.message);
      return [];
    }

    const diffLines = diffOutput.split('\n');

    for (const line of diffLines) {
      if (line.startsWith('+++ b/')) {
        const relativePath = line.substring(6); 
        currentFilePath = path.join(this.projectRoot, relativePath);
        continue;
      }

      if (!currentFilePath) {
        continue; 
      }

      if (line.startsWith('@@')) {
        const hunkMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
        
        if (hunkMatch && hunkMatch[1]) {
          const lineNumber = parseInt(hunkMatch[1], 10);
          
          const content = this.getFileContent(currentFilePath); 
          if (!content) continue;

          const charIndex = this.convertLineToCharIndex(content, lineNumber);

          const entityMap = this.topEntitiesMap.get(currentFilePath);
          if (!entityMap) continue; 

          const entity = this.findEntityAtPosition(entityMap, charIndex);

          if (entity) {
            const key = `${currentFilePath}#${entity.fn}`;
            
            if (!changedEntities.has(key)) {
              changedEntities.set(key, {
                fn: entity.fn,
                path: currentFilePath
              });
            }
          }
        }
      }
    }

    return Array.from(changedEntities.values());
  }
}