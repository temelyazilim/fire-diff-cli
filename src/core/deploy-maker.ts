/**
 * Deployment name generator module.
 * 
 * This module analyzes the project's entry point file to build a mapping
 * of group names to imported files, then generates Firebase deployment names
 * for affected endpoints.
 * 
 * @module core/deploy-maker
 */

import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { AnalysisSeed } from './types';

/**
 * Analyzes the entry point file to build deployment group mappings
 * and generate Firebase deployment names.
 * 
 * @class DeployMaker
 */
export class DeployMaker {
  /** Project root directory path. */
  private projectRoot: string;
  /** Affected endpoints that need deployment names. */
  private affectedEndPoints: AnalysisSeed[];
  /** Absolute path to the main entry file (e.g., index.ts). */
  private indexTsPath: string;
  
  /**
   * Map of file paths to their deployment group names.
   * Key: Absolute path (e.g., ".../src/exports/gamefunctions.ts")
   * Value: Group name (e.g., "gf")
   */
  private deploymentNameMap: Map<string, string>;

  /**
   * Creates the DeployMaker instance.
   * @param affectedEndPoints The list of "dirty" endpoints from FaeptsAnalyzer.
   * @param projectRoot The absolute path to the project root (e.g., ".../functions").
   */
  constructor(affectedEndPoints: AnalysisSeed[], projectRoot: string) {
    this.affectedEndPoints = affectedEndPoints;
    this.projectRoot = projectRoot;
    this.deploymentNameMap = new Map<string, string>();
    
    // Read 'firebase.json' and find the main entry point
    this.indexTsPath = this.findIndexFileFromConfig();

    // Analyze the main entry file and build the deployment group map
    this.buildDeploymentMap();
  }

  /**
   * Reads 'firebase.json' to find the 'main' entry point and converts it
   * back to its source .ts path (e.g., "lib/index.js" -> "src/index.ts").
   * 
   * @returns Absolute path to the main TypeScript entry file.
   */
  private findIndexFileFromConfig(): string {
    const configPath = path.join(this.projectRoot, '../firebase.json');
    const defaultIndexPath = path.join(this.projectRoot, 'src/index.ts');

    let mainJsPath: string;

    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const firebaseConfig = JSON.parse(configContent);

      if (Array.isArray(firebaseConfig.functions)) {
        const functionsConfig = firebaseConfig.functions.find(
          (f: any) => f.source === path.basename(this.projectRoot)
        );
        mainJsPath = functionsConfig?.main;
      } else {
        mainJsPath = firebaseConfig.functions?.main;
      }

      if (!mainJsPath) {
        return defaultIndexPath;
      }

      const mainTsPath = mainJsPath
        .replace(/^lib\//, 'src/')
        .replace(/^dist\//, 'src/')
        .replace(/\.js$/, '.ts');
        
      return path.join(this.projectRoot, mainTsPath);

    } catch (e) {
      console.warn(`[FIRE-DIFF Warning] Could not read firebase.json. Assuming 'src/index.ts'.`);
      return defaultIndexPath;
    }
  }

  /**
   * Reads the 'index.ts' file and finds all 'exports.GROUP = require(...)'
   * and 'export * from ...' notations to build the deployment map.
   * 
   * Supports both CommonJS (exports.GROUP = require(...)) and ES Module
   * (export * from ...) syntax patterns.
   */
  private buildDeploymentMap(): void {
    let sourceFile: ts.SourceFile;
    try {
      const content = fs.readFileSync(this.indexTsPath, 'utf8');
      sourceFile = ts.createSourceFile(
        this.indexTsPath,
        content,
        ts.ScriptTarget.ESNext
      );
    } catch (e) {
      console.warn(`[FIRE-DIFF Warning] Could not read entry point file: ${this.indexTsPath}. Group names may be missing.`);
      return;
    }

    const indexDir = path.dirname(this.indexTsPath);

    ts.forEachChild(sourceFile, (node) => {
      
      // V1 Notation: exports.groupName = require('./path')
      if (
        ts.isExpressionStatement(node) &&
        ts.isBinaryExpression(node.expression) &&
        node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(node.expression.left) &&
        ts.isIdentifier(node.expression.left.expression) &&
        node.expression.left.expression.text === 'exports' &&
        ts.isCallExpression(node.expression.right) &&
        ts.isIdentifier(node.expression.right.expression) &&
        node.expression.right.expression.text === 'require'
      ) {
        
        // Safely get the require path argument
        const arg = node.expression.right.arguments[0];

        // Check if argument exists and is a string literal
        if (arg && ts.isStringLiteral(arg)) {
          const groupName = node.expression.left.name.text; // e.g., "gf"
          const requirePath = arg.text; // e.g., "./exports/gamefunctions"
          
          // Resolve to absolute path and normalize (remove .ts extension for matching)
          // TypeScript require paths don't include .ts extension, so we add it
          let absolutePath = path.resolve(indexDir, requirePath);
          if (!absolutePath.endsWith('.ts')) {
            absolutePath = absolutePath + '.ts';
          }
          // Normalize path (remove extension for map key to match getDeployNames logic)
          const parsedPath = path.parse(absolutePath);
          const pathWithoutExtension = path.resolve(parsedPath.dir, parsedPath.name);
          this.deploymentNameMap.set(pathWithoutExtension, groupName);
        }
      }

      // V2/ESM Notation: export * from './path'
      // Note: export * from does NOT use group names - functions are exported directly
      // So we don't add these to the deployment map (they will use function name as-is)
      // This is intentionally left empty - export * from files should not have prefixes
    });
  }

  /**
   * Generates the final, unique list of deployable function names.
   * @returns An array of strings (e.g., ["gf-setMyInfoTitle", "checkGameAlerts"]).
   */
  public getDeployNames(): string[] {
    const finalNames = new Set<string>();

    for (const endpoint of this.affectedEndPoints) {
      
      // Rule 1: If endpoint is in 'index.ts' (main entry file)
      if (endpoint.path === this.indexTsPath) {
        finalNames.add(endpoint.fn);
        continue;
      }

      // Rule 2: If endpoint is in the deployment group map
      const parsedPath = path.parse(endpoint.path);
      const pathWithoutExtension = path.resolve(parsedPath.dir, parsedPath.name);
      
      const groupName = this.deploymentNameMap.get(pathWithoutExtension);

      if (groupName) {
        // V1 notation: 'group-function'
        finalNames.add(`${groupName}-${endpoint.fn}`);
      } else {
        // Rule 3: V2 or not in map (use function name as-is)
        finalNames.add(endpoint.fn);
      }
    }

    return Array.from(finalNames);
  }
}