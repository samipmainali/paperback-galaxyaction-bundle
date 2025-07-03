#!/bin/bash

# Script to update only bundle files in git
# This script will:
# 1. Build the bundles
# 2. Add only bundle files to git
# 3. Commit and push the changes

set -e  # Exit on any error

echo "🔄 Building bundles..."
npm run bundle

echo "📁 Adding bundle files to git..."
git add bundles/

echo "📝 Committing bundle updates..."
git commit -m "Update GalaxyAction bundle - $(date '+%Y-%m-%d %H:%M:%S')"

echo "🚀 Pushing to remote..."
git push

echo "✅ Bundle update complete!"
echo "📦 Bundle files updated and pushed to repository" 