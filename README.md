# fire-diff

CLI tool to find affected Firebase Cloud Functions endpoints based on git changes. This tool analyzes your codebase to determine which Firebase Cloud Functions need to be redeployed when specific files are modified.

## Features

- 🔍 **Automatic Dependency Analysis**: Recursively finds all functions affected by code changes
- 📊 **Git Integration**: Analyzes git diff to identify changed files
- 🚀 **Deployment Ready**: Outputs deployment names ready for Firebase deployment
- 📋 **List All Endpoints**: List all Firebase Functions endpoints in your project
- 📄 **JSON Output Support**: Export endpoint lists in structured JSON format
- 🔄 **Firebase V1/V2 Support**: Automatically detects and distinguishes between Firebase Functions V1 and V2
- 🔗 **Re-export Support**: Correctly tracks endpoints exported via `export * from` and `export { } from` statements
- ⚡ **Fast**: Uses caching and efficient dependency traversal
- 🎯 **TypeScript Support**: Built for TypeScript projects
- 🎯 **Granular Property Tracking**: Detects changes to specific object properties and only affects functions using those properties

## What's New in v1.0.7

### 🔧 Function Content Change Detection

**fire-diff** now correctly detects changes within existing functions! Previously, when you modified function content (e.g., changing `timeoutSeconds`, removing `minInstances`), the tool might miss these changes if the function definition line itself wasn't modified.

**Example:**
```typescript
// Before
export const makeMoveV2 = onCall({
    cors: false,
    minInstances: 1,
    cpu: 1,
    timeoutSeconds: 10
}, async (request: any) => { ... });

// After (minInstances and cpu removed)
export const makeMoveV2 = onCall({
    cors: false,
    timeoutSeconds: 10
}, async (request: any) => { ... });
// ✅ Now correctly detected as changed
```

**Benefits:**
- ✅ **Comprehensive detection**: Detects all changes within function bodies, not just function definitions
- ✅ **Improved accuracy**: Scans all modified lines in git diff hunks to find containing functions
- ✅ **No false negatives**: Functions with internal changes are now reliably detected

### 🔗 CommonJS Re-export Support

**fire-diff** now supports CommonJS re-exports! When functions are exported via `exports.groupName = require('./path')` in `index.ts`, the tool correctly tracks dependencies and detects affected endpoints.

**Example:**
```typescript
// index.ts
exports.gf = require('./exports/gamefunctions');

// exports/gamefunctions.ts
export const makeMoveV2 = onCall({ ... });
// ✅ Changes to makeMoveV2 are now correctly detected
```

**Benefits:**
- ✅ **CommonJS compatibility**: Works with both ES6 (`export * from`) and CommonJS (`exports.xxx = require()`) re-export patterns
- ✅ **Complete coverage**: All re-export patterns are now supported

## What's New in v1.0.6

### 🆕 New File Detection

**fire-diff** now automatically detects functions in newly created files! When you add a new TypeScript file with Firebase Cloud Functions, all functions in that file are automatically included in the affected endpoints list.

**Example:**
```typescript
// src/user/triggers.ts (new file)
export const onUserInfoWritten = onValueWritten(...);
// ✅ Automatically detected and included in affected endpoints
```

### 📁 Multiple Functions Directories Support

**fire-diff** now supports Firebase projects with multiple functions directories! When your `firebase.json` contains an array of function configurations, the tool automatically scans all configured function source directories.

**Benefits:**
- ✅ **Multi-project support**: Works with projects that have separate function directories (e.g., `functions`, `functions-v2`)
- ✅ **Automatic detection**: Reads `firebase.json` to identify all function source directories
- ✅ **Smart scanning**: Only scans configured directories, ignoring external packages like `node_modules`

### 🔍 Improved File Scanning

- **Better ignore patterns**: Now correctly ignores `node_modules` at any directory level
- **Project-aware scanning**: Respects Firebase project structure and only scans relevant directories

## What's New in v1.0.5

### 🎯 Object Property Dependency Tracking

**fire-diff** now intelligently tracks changes to individual object properties! When you modify a single property in an object (e.g., `GATHERING_FIELD_KEYS.LAST_UPDATE_OPTIONS`), only functions that actually use that specific property are marked as affected.

**Example:**
```typescript
// constants.ts
export const GATHERING_FIELD_KEYS = {
  CREATOR: "cre",
  LAST_UPDATE_OPTIONS: "luo",  // ← Only this property changed
} as const;

// session.ts
export const setSessionOptionsChanged = async (...) => {
  // Uses GATHERING_FIELD_KEYS.LAST_UPDATE_OPTIONS
  const ref = sessionDb().ref(`.../${GATHERING_FIELD_KEYS.LAST_UPDATE_OPTIONS}`)
  // ✅ This function WILL be affected
};

// gathering.ts
export const onGatheringCreated = onValueCreated(..., async (event) => {
  // Uses GATHERING_FIELD_KEYS.CREATOR
  const creator = snapshot.child(`${GATHERING_FIELD_KEYS.CREATOR}`);
  // ✅ This function will NOT be affected (different property)
});
```

**Benefits:**
- ✅ **Reduced false positives**: No more unnecessary deployments when unrelated properties change
- ✅ **Precise tracking**: AST-based analysis ensures accurate property usage detection
- ✅ **Backward compatible**: Regular variables (e.g., `DEFAULT_LIMIT = 3`) continue to work as before

## Installation

### Global Installation

```bash
npm install -g fire-diff
```

### Local Installation (Recommended)

```bash
npm install --save-dev fire-diff
```

## Usage

Run the tool in your Firebase Functions directory. You have three options:

### Option 1: Direct Command (Global Installation)

If installed globally:

```bash
fire-diff
```

### Option 2: Using npx (Local Installation)

If installed locally:

```bash
npx fire-diff
```

### Option 3: Using npm Script (Recommended)

Add to your `package.json` scripts:

```json
{
  "scripts": {
    "affected": "fire-diff"
  }
}
```

Then run:

```bash
npm run affected
```

### Quick Setup

To automatically add the script to your `package.json`:

```bash
npx fire-diff-setup
```

This will add the `"affected": "fire-diff"` script to your `package.json`.

## Commands

### `analyze` (Default)

Analyzes git changes and finds affected Firebase Cloud Functions endpoints:

```bash
fire-diff
# or
fire-diff analyze
```

### `endpoints`

Lists all Firebase Functions endpoints in your project:

```bash
fire-diff endpoints
```

**Options:**
- `--json`: Output results in JSON format

```bash
fire-diff endpoints --json
```

The JSON output groups endpoints by file path and Firebase version (v1/v2), making it easy to process programmatically.

### Help

Display help information:

```bash
fire-diff --help
# or
fire-diff -h
```

## Example Output

### Analyze Command

```
Affected endpoints:
-------------------
iap-logPurchaseToken
iap-listenAppleOrder
iap-removeAdsWithGold
iap-readPurchases

Ready to deploy:
----------------
firebase deploy --only functions:iap-logPurchaseToken,functions:iap-listenAppleOrder,functions:iap-removeAdsWithGold,functions:iap-readPurchases
```

### Endpoints Command

```
[FIRE-DIFF] Listing all endpoints in the project...
--------------------------------------------
| src/index.ts
--------------------------------------------
checkGameTimeouts (checkGameTimeouts) [functions.pubsub.schedule - v1]
checkOldChatImagesForDeleteV2 (checkOldChatImagesForDeleteV2) [onSchedule - v2]
...
--------------------------------------------
| src/exports/gamefunctions.ts
--------------------------------------------
gf-getGame (getGame) [functions.https.onCall - v1]
gf-makeMoveV2 (makeMoveV2) [onCall - v2]
...
```

### JSON Output

```json
{
  "src/index.ts": {
    "v1": [
      {
        "name": "checkGameTimeouts",
        "deployname": "checkGameTimeouts",
        "kind": "functions.pubsub.schedule"
      }
    ],
    "v2": [
      {
        "name": "checkOldChatImagesForDeleteV2",
        "deployname": "checkOldChatImagesForDeleteV2",
        "kind": "onSchedule"
      }
    ]
  }
}
```

The tool will:
1. Analyze your project structure
2. Check git changes (staged and unstaged)
3. Find all affected Firebase Cloud Functions
4. Output deployment names in both list and command format

## How It Works

1. **Project Analysis**: Scans your TypeScript project to build a dependency graph
2. **Git Analysis**: Identifies changed `.ts` files using `git diff`
3. **Dependency Traversal**: Recursively finds all functions that depend on changed files
4. **Deployment Mapping**: Maps affected functions to deployment groups based on your `index.ts` structure

## Changelog

### [1.0.7] - 2025-01-15

#### Fixed
- **Function content change detection**: Now correctly detects changes within existing function bodies (e.g., modifying `timeoutSeconds`, removing `minInstances`) even when the function definition line itself isn't modified
- **CommonJS re-export support**: Fixed issue where functions exported via `exports.groupName = require('./path')` in `index.ts` were not being tracked correctly

#### Technical Improvements
- Enhanced `getChangedEntities()` in `git-analyzer.ts` to scan all modified lines in git diff hunks (both `+` and `-` lines) to find containing functions
- Added CommonJS export pattern detection in `findReExportedInfo()` method in `analyzer.ts` to support `exports.xxx = require()` re-exports
- Improved hunk processing to check all changed lines, not just hunk start position

### [1.0.6] - 2025-01-15

#### Added
- **New file detection**: Now automatically detects and includes all functions from newly created (untracked) TypeScript files
- **Multiple functions directories support**: Automatically detects and scans all function source directories configured in `firebase.json` when using array format
- **Improved file scanning**: Enhanced `getSourceFiles` to correctly ignore `node_modules` at any directory level using `**/node_modules/**` pattern

#### Fixed
- **File scanning scope**: Fixed issue where `node_modules` within function directories were being scanned when running from project root
- **New file detection**: Fixed issue where functions in newly created files were not being detected in the affected endpoints list

#### Technical Improvements
- Added `findNewFileEntities` method in `git-analyzer.ts` to parse and extract functions from untracked files
- Enhanced `getChangedEntities` to use `git status --porcelain` for detecting new files
- Added `findFirebaseConfig` and `getFunctionsSources` functions in `file-system.ts` to support multiple function directories
- Updated `getProjectFiles` to read `firebase.json` and scan all configured function source directories separately
- Improved ignore patterns in `getSourceFiles` to use glob patterns that work at any directory level

### [1.0.5] - 2025-11-24

#### Added
- **Object property dependency tracking**: Now detects changes to specific object properties (e.g., `GATHERING_FIELD_KEYS.LAST_UPDATE_OPTIONS`) and only marks functions that use that specific property as affected
- **Granular property change detection**: When only a single property in an object changes, only functions using that property are affected, not all functions using the object

#### Fixed
- **False positive detection**: Fixed issue where changing one property in an object (e.g., `LAST_UPDATE_OPTIONS`) incorrectly marked all functions using any property from that object (e.g., `CREATOR`) as affected
- Now correctly identifies which specific property changed and only affects functions using that property

#### Technical Improvements
- Added `detectObjectPropertyChange` method in `git-analyzer.ts` to identify object property changes from git diff
- Added `usesProperty` method in `analyzer.ts` using AST to accurately detect property usage in code blocks
- Enhanced dependency analysis to distinguish between property access (e.g., `OBJECT.PROPERTY`) and regular variable usage
- Maintains backward compatibility: non-property variables (e.g., `DEFAULT_LIMIT = 3`) continue to work as before

### [1.0.4] - 2025-11-23

#### Fixed
- **New function detection**: Now correctly identifies newly added functions instead of incorrectly marking previous functions as changed
- **Export prefix handling**: Fixed issue where `export * from './path'` was incorrectly adding file name as prefix (e.g., `endpoints-createGathering`). Now uses function name directly (e.g., `createGathering`)
- **Path resolution**: Fixed `exports.gf = require(...)` path resolution issue that was preventing correct deployment name generation
- **Named exports**: Fixed issue where all functions in a file were reported as changed when only specific functions were exported via `export { name } from './path'`. Now only reports the actually changed functions
- **Wildcard exports**: Fixed issue where all functions in a file were reported as changed when using `export * from './path'`. Now only reports the actually changed function

#### Technical Improvements
- Changed git diff from `--unified=0` to `--unified=3` to enable detection of newly added functions
- Added function definition detection in git diff hunk content for newly added functions
- Enhanced `findEntityAtPosition` to prioritize exact position matches for better accuracy
- Improved re-export handling to only include exported functions in named exports

### [1.0.3] - 2025-11-22

#### Fixed
- **Re-export support**: Now correctly detects affected endpoints when files are re-exported through `index.ts` or other files
- Fixed issue where endpoints exported via `export * from './path'` or `export { name } from './path'` were not detected in dependency analysis
- Improved dependency tracking for re-exported modules

#### Technical Improvements
- Enhanced `findFilesImportingTarget` to track re-export statements (`export * from`, `export { } from`)
- Added `findReExportedPath` method to analyzer for detecting re-export relationships
- Re-exported endpoints are now directly added to affected endpoints list when source files change

### [1.0.2] - 2025-11-14

#### Added
- `endpoints` command to list all Firebase Functions endpoints in the project
- `--json` flag for structured JSON output of endpoint lists
- Improved Firebase Functions V1/V2 detection and distinction
- Firebase CLI-like command structure (`fire-diff [command] [options]`)

#### Changed
- CLI argument parsing now follows Firebase CLI conventions
- JSON output groups endpoints by file path and version (v1/v2)

### [1.0.1] - 2025-11-13

#### Features
- Automatic dependency analysis for affected Firebase Functions
- Git integration for change detection
- Deployment-ready output format
- TypeScript project support

## Requirements

- Node.js >= 14.0.0
- TypeScript project
- Git repository
- Firebase Cloud Functions project structure

## Project Structure

The tool expects a Firebase Functions project structure with:
- An `index.ts` file that exports function groups
- TypeScript source files in your project
- Git repository for change detection

## Development

```bash
# Clone the repository
git clone https://github.com/temelyazilim/fire-diff-cli.git

# Install dependencies
npm install

# Build the project
npm run build
```

## License

MIT © [Serdar Temel](https://temel.xyz)

## Author

**Serdar Temel**

- Email: serdar@temel.xyz
- Website: https://temel.xyz

## Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/temelyazilim/fire-diff-cli/issues).

## Support

If you find this tool useful, please consider giving it a ⭐ on GitHub!

