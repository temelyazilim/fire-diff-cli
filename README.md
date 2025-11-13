# fire-diff

CLI tool to find affected Firebase Cloud Functions endpoints based on git changes. This tool analyzes your codebase to determine which Firebase Cloud Functions need to be redeployed when specific files are modified.

## Features

- 🔍 **Automatic Dependency Analysis**: Recursively finds all functions affected by code changes
- 📊 **Git Integration**: Analyzes git diff to identify changed files
- 🚀 **Deployment Ready**: Outputs deployment names ready for Firebase deployment
- ⚡ **Fast**: Uses caching and efficient dependency traversal
- 🎯 **TypeScript Support**: Built for TypeScript projects

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

## Example Output

```
Affected endpoints:
-------------------
gf
auth
api

Ready to deploy:
----------------
firebase deploy --only functions:gf,functions:auth,functions:api
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

