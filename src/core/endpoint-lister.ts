/**
 * Endpoint lister module.
 * 
 * This module provides a standalone class to scan and list all Firebase
 * Cloud Functions endpoints in the project, independent of git changes.
 * 
 * @module core/endpoint-lister
 */

import fs from 'fs';
import path from 'path';
import ts from 'typescript';

import { getProjectFiles } from '../utils/file-system';
import { fileTopFunctions } from './find-top-functions';
import { getEndpointInfo } from './firebase-helpers';
import { EndpointListResult, FileFunctionsResult, TopLevelEntity } from './types';

/**
 * Standalone auditing class.
 *
 * Scans the entire project (independent of git changes) to find
 * and list all deployed Firebase Functions endpoints, calculating
 * their final deployment names based on 'firebase.json' and 'index.ts'
 * grouping structures.
 * 
 * @class EndPointLister
 */
export class EndPointLister {
  private projectRoot: string;
  private allFiles: string[];
  private topEntities: FileFunctionsResult[];
  private indexTsPath: string;
  private deploymentNameMap: Map<string, string>;
  private fileContentCache: Map<string, string> = new Map();

  /**
   * Creates the EndPointLister instance.
   * This runs the project mapping and deployment map generation.
   */
  constructor() {
    const { projectRoot, allFiles } = getProjectFiles();
    this.projectRoot = projectRoot;
    this.allFiles = allFiles;

    this.topEntities = this.allFiles.map(file => {
      return fileTopFunctions(file);
    });

    this.deploymentNameMap = new Map<string, string>();
    this.indexTsPath = this._findIndexFileFromConfig();
    this._buildDeploymentMap();
  }

  /**
   * Gets the full text content of a file, using a cache.
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
   * Reads 'firebase.json' to find the 'main' entry point.
   * @returns The absolute path to the main entry file (e.g., 'src/index.ts').
   */
  private _findIndexFileFromConfig(): string {
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
   * Reads the 'index.ts' (main entry) file and builds the
   * deploymentNameMap for V1 function groups.
   */
  private _buildDeploymentMap(): void {
    let sourceFile: ts.SourceFile;
    try {
      const content = this.getFileContent(this.indexTsPath);
      if (!content) return;
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
        const arg = node.expression.right.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          const groupName = node.expression.left.name.text;
          const requirePath = arg.text;
          const absolutePath = path.resolve(indexDir, requirePath);
          this.deploymentNameMap.set(absolutePath, groupName);
        }
      }

      // V2/ESM Notation: export * from './path'
      if (ts.isExportDeclaration(node) && !node.exportClause && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const requirePath = node.moduleSpecifier.text; 
        const groupName = path.basename(requirePath); 
        const absolutePath = path.resolve(indexDir, requirePath);
        this.deploymentNameMap.set(absolutePath, groupName);
      }
    });
  }

  /**
   * Calculates the final deployment name for a given endpoint.
   * @param endpoint The TopLevelEntity (fn, start) to check.
   * @param filePath The absolute path of the file containing the entity.
   * @returns The final deployment name as a string.
   */
  private getDeployName(endpoint: TopLevelEntity, filePath: string): string {
    if (filePath === this.indexTsPath) {
      return endpoint.fn;
    }

    const parsedPath = path.parse(filePath);
    const pathWithoutExtension = path.resolve(parsedPath.dir, parsedPath.name);
    const groupName = this.deploymentNameMap.get(pathWithoutExtension);

    if (groupName) {
      return `${groupName}-${endpoint.fn}`;
    } else {
      return endpoint.fn;
    }
  }

  /**
   * Scans the entire project and returns a list of all found
   * Firebase Function endpoints with their full metadata.
   *
   * @returns An array of EndpointListResult objects.
   */
  public listAllEndpoints(): EndpointListResult[] {
    const allEndpoints: EndpointListResult[] = [];

    for (const fileMap of this.topEntities) {
      const filePath = fileMap.path;
      const fileContent = this.getFileContent(filePath);
      if (!fileContent) continue;
      
      const sortedEntities = fileMap.funcs;

      for (let i = 0; i < sortedEntities.length; i++) {
        const entity = sortedEntities[i];
        if (!entity) continue;
        
        const start = entity.start;
        const nextEntity = sortedEntities[i + 1];
        const end = nextEntity ? nextEntity.start : fileContent.length;

        const blockContent = fileContent.substring(start, end);
        const endpointInfo = getEndpointInfo(blockContent);

        if (endpointInfo.isEndpoint) {
          allEndpoints.push({
            path: path.relative(this.projectRoot, filePath),
            name: entity.fn,
            deployname: this.getDeployName(entity, filePath),
            kind: endpointInfo.kind,
            version: endpointInfo.version,
          });
        }
      }
    }
    
    return allEndpoints;
  }
}