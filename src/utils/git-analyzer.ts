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
import { fileTopFunctions } from '../core/find-top-functions';

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
   * Checks if a line contains a function definition.
   * 
   * @param line The line to check (without leading + or -).
   * @returns True if the line contains a function definition pattern.
   */
  private isFunctionDefinitionLine(line: string): boolean {
    const trimmed = line.trim();
    // Match: export const functionName = ...
    // Match: export function functionName ...
    // Match: export async function functionName ...
    return /^(export\s+)?(const|function|async\s+function)\s+\w+\s*[=(]/.test(trimmed) ||
           /^export\s+const\s+\w+\s*=/.test(trimmed);
  }

  /**
   * Extracts function name from a function definition line.
   * 
   * @param line The line containing the function definition.
   * @returns Function name or null if not found.
   */
  private extractFunctionName(line: string): string | null {
    const trimmed = line.trim();
    
    // Match: export const functionName = ...
    const constMatch = /(?:export\s+)?const\s+(\w+)\s*=/.exec(trimmed);
    if (constMatch && constMatch[1]) {
      return constMatch[1];
    }
    
    // Match: export function functionName ...
    const functionMatch = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*[\(]/.exec(trimmed);
    if (functionMatch && functionMatch[1]) {
      return functionMatch[1];
    }
    
    return null;
  }

  /**
   * Detects if a changed line is an object property and extracts the property path.
   * 
   * @param changedLine The line that was changed (with + or - prefix removed).
   * @param fileContent Full content of the file to find parent object name.
   * @param lineNumber 1-based line number of the changed line.
   * @param entityMap File's entity map to find the containing entity.
   * @returns Property path in format "OBJECT_NAME.PROPERTY_NAME" or null if not a property change.
   */
  private detectObjectPropertyChange(
    changedLine: string, 
    fileContent: string, 
    lineNumber: number,
    entityMap: FileFunctionsResult
  ): string | null {
    const trimmed = changedLine.trim();
    
    // Match object property pattern: PROPERTY_NAME: "value" or PROPERTY_NAME: value
    // Examples: LAST_UPDATE_OPTIONS: "luo", CREATOR: "cre"
    const propertyMatch = /^\s*(\w+)\s*:\s*/.exec(trimmed);
    if (!propertyMatch || !propertyMatch[1]) {
      return null;
    }
    
    const propertyName = propertyMatch[1];
    
    // Find which entity contains this line
    const lineCharIndex = this.convertLineToCharIndex(fileContent, lineNumber);
    const containingEntity = this.findEntityAtPosition(entityMap, lineCharIndex);
    
    if (!containingEntity) {
      return null;
    }
    
    // Get the entity's content block
    const sortedEntities = entityMap.funcs;
    const entityIndex = sortedEntities.indexOf(containingEntity);
    const start = containingEntity.start;
    const nextEntity = sortedEntities[entityIndex + 1];
    const end = nextEntity ? nextEntity.start : fileContent.length;
    const entityContent = fileContent.substring(start, end);
    
    // Check if this entity is an object declaration (const OBJECT_NAME = { ... })
    const objectDeclMatch = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*\{/.exec(entityContent);
    if (!objectDeclMatch || !objectDeclMatch[1]) {
      return null;
    }
    
    const objectName = objectDeclMatch[1];
    
    // Verify that the property is actually in this object by checking if it's within the object's braces
    // Simple check: if the property line appears after the opening brace
    const objectStartIndex = entityContent.indexOf('{');
    if (objectStartIndex === -1) {
      return null;
    }
    
    // Check if the changed line is within the object (after the opening brace)
    const relativeLineIndex = lineCharIndex - start;
    if (relativeLineIndex > objectStartIndex) {
      return `${objectName}.${propertyName}`;
    }
    
    return null;
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
    
    // First, check if position exactly matches a function's start position
    // This handles cases where a new function is added and git diff points to its start
    for (let i = 0; i < sortedEntities.length; i++) {
      const currentEntity = sortedEntities[i];
      if (!currentEntity) continue;

      if (position === currentEntity.start) {
        return currentEntity;
      }
    }
    
    // If no exact match, use the original logic to find which function contains the position
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
   * Finds all entities (functions, classes, etc.) in new files.
   * 
   * @param newFiles Array of absolute file paths for new files.
   * @returns Array of AnalysisSeed objects for all entities found in new files.
   */
  private findNewFileEntities(newFiles: string[]): AnalysisSeed[] {
    const entities: AnalysisSeed[] = [];
    
    for (const filePath of newFiles) {
      try {
        const entityMap = fileTopFunctions(filePath);
        if (entityMap && entityMap.funcs.length > 0) {
          for (const entity of entityMap.funcs) {
            entities.push({
              fn: entity.fn,
              path: filePath
            });
          }
        }
      } catch (e) {
        // Skip if file cannot be read or parsed
      }
    }
    
    return entities;
  }

  /**
   * Runs 'git diff' and analyzes the output to find all changed entities.
   * 
   * @returns Array of changed entities (functions, classes, etc.) found in git diff.
   */
  public getChangedEntities(): AnalysisSeed[] {
    const changedEntities = new Map<string, AnalysisSeed>();
    let currentFilePath: string | undefined = undefined;
    
    const diffCommand = 'git diff HEAD --relative --unified=3 -- "*.ts" ":(exclude)src/__tests__" ":(exclude)*.test.ts" ":(exclude)*.spec.ts"';
    
    let diffOutput: string;
    try {
      diffOutput = execSync(diffCommand, { cwd: this.projectRoot }).toString();
    } catch (e: any) {
      console.error(`[FIRE-DIFF Error] 'git diff' command failed.`);
      console.error(e.message);
      return [];
    }

    const diffLines = diffOutput.split('\n');
    let inHunk = false;
    let hunkStartLine = 0;

    for (const line of diffLines) {
      if (line.startsWith('+++ b/')) {
        const relativePath = line.substring(6); 
        currentFilePath = path.join(this.projectRoot, relativePath);
        inHunk = false;
        continue;
      }

      if (!currentFilePath) {
        continue; 
      }

      if (line.startsWith('@@')) {
        const hunkMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
        
        if (hunkMatch && hunkMatch[1]) {
          hunkStartLine = parseInt(hunkMatch[1], 10);
          inHunk = true;
          
          const content = this.getFileContent(currentFilePath); 
          if (!content) {
            inHunk = false;
            continue;
          }

          const charIndex = this.convertLineToCharIndex(content, hunkStartLine);

          const entityMap = this.topEntitiesMap.get(currentFilePath);
          if (!entityMap) {
            inHunk = false;
            continue;
          } 

          // First, check if any newly added lines contain function definitions
          // This handles cases where a new function is added
          let foundNewFunction = false;
          let foundPropertyChange = false;
          
          // Read ahead in the hunk to find function definitions and property changes in added lines
          let currentLineIndex = diffLines.indexOf(line);
          let currentLineNumber = hunkStartLine;
          
          for (let i = currentLineIndex + 1; i < diffLines.length && i < currentLineIndex + 50; i++) {
            const hunkLine = diffLines[i];
            if (!hunkLine) break;
            
            // Stop if we hit the next hunk or file header
            if (hunkLine.startsWith('@@') || hunkLine.startsWith('+++') || hunkLine.startsWith('---')) {
              break;
            }
            
            // Track line numbers: only increment for context lines (starting with space) and added lines (+)
            // Deleted lines (-) don't increment the line number in the new file
            if (hunkLine.startsWith('+') && !hunkLine.startsWith('+++')) {
              // This is an added line in the new file
              const addedLine = hunkLine.substring(1);
              
              // First, check if this is an object property change
              if (!foundPropertyChange) {
                const propertyPath = this.detectObjectPropertyChange(addedLine, content, currentLineNumber, entityMap);
                if (propertyPath) {
                  // Found a property change, mark it as changed
                  const key = `${currentFilePath}#${propertyPath}`;
                  if (!changedEntities.has(key)) {
                    changedEntities.set(key, {
                      fn: propertyPath,
                      path: currentFilePath
                    });
                    foundPropertyChange = true;
                  }
                }
              }
              
              // Check if this line contains a function definition
              if (!foundNewFunction && this.isFunctionDefinitionLine(addedLine)) {
                // Extract function name from the line
                const functionName = this.extractFunctionName(addedLine);
                if (functionName) {
                  // Find the entity with this name
                  const newEntity = entityMap.funcs.find(e => e.fn === functionName);
                  if (newEntity) {
                    const key = `${currentFilePath}#${newEntity.fn}`;
                    if (!changedEntities.has(key)) {
                      changedEntities.set(key, {
                        fn: newEntity.fn,
                        path: currentFilePath
                      });
                      foundNewFunction = true;
                    }
                  }
                }
              }
              
              currentLineNumber++;
            } else if (hunkLine.startsWith(' ')) {
              // Context line (unchanged), increment line number
              currentLineNumber++;
            }
            // Deleted lines (-) don't increment the line number
          }
          
          // If we didn't find a new function definition or property change, use the original logic
          if (!foundNewFunction && !foundPropertyChange) {
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
    }

    // Detect new files and add their functions
    const statusCommand = 'git status --porcelain -- "*.ts" ":(exclude)src/__tests__" ":(exclude)*.test.ts" ":(exclude)*.spec.ts"';
    try {
      const statusOutput = execSync(statusCommand, { cwd: this.projectRoot }).toString();
      const statusLines = statusOutput.split('\n');
      const newFiles: string[] = [];
      
      for (const line of statusLines) {
        if (line.startsWith('??')) {
          let relativePath = line.substring(3).trim();
          if (relativePath) {
            // If path starts with projectRoot's basename (e.g., "functions/..."), remove it
            const rootBasename = path.basename(this.projectRoot);
            if (relativePath.startsWith(`${rootBasename}/`)) {
              relativePath = relativePath.substring(rootBasename.length + 1);
            }
            newFiles.push(path.join(this.projectRoot, relativePath));
          }
        }
      }
      
      // Find and add functions from new files
      const newFileEntities = this.findNewFileEntities(newFiles);
      for (const entity of newFileEntities) {
        const key = `${entity.path}#${entity.fn}`;
        if (!changedEntities.has(key)) {
          changedEntities.set(key, entity);
        }
      }
    } catch (e) {
      // Silently continue on error
    }

    return Array.from(changedEntities.values());
  }
}