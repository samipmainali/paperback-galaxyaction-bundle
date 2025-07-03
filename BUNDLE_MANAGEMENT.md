# Bundle Management Scripts

This repository contains scripts to manage bundle files for Paperback extensions.

## Available Scripts

### 1. `build-and-update.sh` (Recommended)
Builds bundles from source files and updates only bundle files in git.

**Usage:**
```bash
./build-and-update.sh
```

**What it does:**
- Builds bundles using source files
- Adds only bundle files to git (ignores source files)
- Commits and pushes changes

### 2. `manage-bundles.sh` (Comprehensive)
A full-featured script with multiple options for managing bundles.

**Usage:**
```bash
./manage-bundles.sh [OPTION]
```

**Options:**
- `build` - Build the bundles only
- `commit` - Commit bundle changes only  
- `push` - Push committed changes only
- `all` - Build, commit, and push (default)
- `status` - Show current git status
- `help` - Show help message

**Examples:**
```bash
./manage-bundles.sh build    # Build bundles only
./manage-bundles.sh all      # Build, commit, and push
./manage-bundles.sh status   # Show git status
```

### 3. `update-existing-bundles.sh` (Existing Only)
Updates only existing bundle files without rebuilding. Use this when you want to commit and push bundle changes without running the build process.

**Usage:**
```bash
./update-existing-bundles.sh
```

## Git Configuration

The repository is configured to:
- ✅ Track bundle files in the `bundles/` folder
- ❌ Ignore source files in the `src/` folder (but they're needed for building)
- ❌ Ignore `node_modules/` and other development files

## Workflow

### For Development (Recommended):
1. Make changes to your extension source code in `src/GalaxyAction/`
2. Run `./build-and-update.sh` to build, commit, and push bundle changes
3. Or use `./manage-bundles.sh all` for the same result

### For Bundle Updates Only:
1. Run `./update-existing-bundles.sh` to commit and push existing bundle changes
2. Or use `./manage-bundles.sh commit` then `./manage-bundles.sh push`

## Important Notes

- **Source files are needed**: The `src/` folder contains your GalaxyAction extension source code needed for building
- **Only bundles are tracked**: Git only tracks files in the `bundles/` folder
- **Build process**: The build process uses source files to generate bundle files
- **Automatic detection**: Scripts will automatically detect if there are changes to commit
- **Timestamps**: Bundle files are automatically timestamped in commit messages

## Quick Start

```bash
# Make changes to your extension in src/GalaxyAction/
# Then run:
./build-and-update.sh

# This will:
# 1. Build the bundles
# 2. Add bundle files to git
# 3. Commit with timestamp
# 4. Push to remote repository
``` 