/**
 * Top-level entity extractor module.
 * 
 * This module analyzes TypeScript files to extract all top-level entities
 * including functions, classes, interfaces, types, enums, and CommonJS exports.
 * 
 * @module core/find-top-functions
 */

import fs from 'fs';
import ts from 'typescript';
import { FileFunctionsResult, TopLevelEntity } from './types';

/**
 * Analyzes a single TypeScript file and returns a list of *all*
 * top-level (root-level) entities: functions, classes, interfaces,
 * types, enums, initialized variables, and CommonJS exports (exports.X).
 *
 * @param filePath The absolute path to the .ts file to analyze.
 * @returns An object containing the file path and an array of found entities.
 */
export function fileTopFunctions(filePath: string): FileFunctionsResult {
  const funcs: TopLevelEntity[] = [];
  let sourceFile: ts.SourceFile;

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.ESNext,
      true // setParentNodes = true (Required for .getStart())
    );
  } catch (e: any) {
    console.warn(`[FIRE-DIFF Warning] Could not read or parse file: ${filePath}. Skipping.`);
    return { path: filePath, funcs: [] };
  }

  // Traverse *only* the top-level nodes of the AST
  ts.forEachChild(sourceFile, (node) => {
    
    // Case 1: Standard function declarations
    // e.g., export function setMyInfoTitle() { ... }
    if (ts.isFunctionDeclaration(node)) {
      if (node.name) {
        funcs.push({
          fn: node.name.text,
          start: node.getStart(),
        });
      }
    }
    
    // Case 2: Variable declarations (const, let, var)
    // e.g., export const SOME_CONFIG = { ... }
    else if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (
          declaration.initializer &&
          ts.isIdentifier(declaration.name)
        ) {
          funcs.push({
            fn: declaration.name.text,
            start: node.getStart(),
          });
        }
      }
    }

    // Case 3: Interface declarations
    else if (ts.isInterfaceDeclaration(node)) {
      funcs.push({
        fn: node.name.text,
        start: node.getStart(),
      });
    }

    // Case 4: Type alias declarations
    else if (ts.isTypeAliasDeclaration(node)) {
      funcs.push({
        fn: node.name.text,
        start: node.getStart(),
      });
    }

    // Case 5: Enum declarations
    else if (ts.isEnumDeclaration(node)) {
      funcs.push({
        fn: node.name.text,
        start: node.getStart(),
      });
    }

    else if (ts.isClassDeclaration(node)) {
      if (node.name) {
        // Add the class itself
        funcs.push({
          fn: node.name.text,
          start: node.getStart(),
        });

        // Now, traverse *inside* the class for methods and properties
        ts.forEachChild(node, (classMember) => {
          
          // Case 6a: Class Methods
          if (ts.isMethodDeclaration(classMember)) {
            if (classMember.name && ts.isIdentifier(classMember.name)) {
              funcs.push({
                fn: classMember.name.text,
                start: classMember.getStart(),
              });
            }
          }

          // Case 6b: Class Properties
          if (ts.isPropertyDeclaration(classMember)) {
            if (classMember.name && ts.isIdentifier(classMember.name)) {
              funcs.push({
                fn: classMember.name.text,
                start: classMember.getStart(),
              });
            }
          }

          // Case 6c: Constructor
          if (ts.isConstructorDeclaration(classMember)) {
             funcs.push({
                fn: 'constructor',
                start: classMember.getStart(),
              });
          }
        });
      }
    }

    // Case 7: CommonJS Exports (exports.getGame = ...)
    else if (
      ts.isExpressionStatement(node) &&
      ts.isBinaryExpression(node.expression) &&
      node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.expression.left) &&
      ts.isIdentifier(node.expression.left.expression) &&
      node.expression.left.expression.text === 'exports'
    ) {
      funcs.push({
        fn: node.expression.left.name.text, // e.g., 'getGame'
        start: node.getStart(),
      });
    }
  });
    
  return {
    path: filePath,
    // Sort is required to guarantee 'start' order for the "next item's start" logic
    funcs: funcs.sort((a, b) => a.start - b.start),
  };
}