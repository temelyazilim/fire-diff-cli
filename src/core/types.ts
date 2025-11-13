/**
 * Type definitions module.
 * 
 * This module contains all TypeScript interfaces and types used throughout
 * the dependency analysis system.
 * 
 * @module core/types
 */

/**
 * Represents a seed entity (function, class, etc.) used as a starting point for analysis.
 */
export interface AnalysisSeed {
    /** The name of the function, class, or entity. */
    fn: string;
    /** The absolute path to the file containing this entity. */
    path: string;
}

/**
 * Represents the analysis result for a single entity.
 */
export interface AnalysisResult {
    /** The name of the function, class, or entity. */
    fn: string;
    /** The absolute path to the file containing this entity. */
    path: string;
    /** Analysis state: false = analyzing, true = analysis complete. */
    checked: boolean;
    /** Array of dependent entities found during analysis. */
    result: AnalysisSeed[];
}

/**
 * Represents a top-level entity found in a TypeScript file.
 */
export interface TopLevelEntity {
    /** The name of the entity. */
    fn: string;
    /** The character position where this entity starts in the file. */
    start: number;
}

/**
 * Represents the result of analyzing a single file for top-level entities.
 */
export interface FileFunctionsResult {
    /** The absolute path to the analyzed file. */
    path: string;
    /** Array of all top-level entities found in the file, sorted by start position. */
    funcs: TopLevelEntity[];
}
  