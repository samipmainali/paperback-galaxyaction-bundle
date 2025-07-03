#!/bin/bash

# Script to update existing bundle files in git
# This script will only commit and push existing bundle files
# Use this when you want to update bundle files without rebuilding

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 Checking for bundle changes...${NC}"

# Check if there are any changes in bundles folder
if git diff --quiet bundles/; then
    echo -e "${YELLOW}⚠️  No changes detected in bundles folder${NC}"
    exit 0
fi

echo -e "${BLUE}📁 Adding bundle files to git...${NC}"
git add bundles/

echo -e "${BLUE}📝 Committing bundle updates...${NC}"
git commit -m "Update existing bundles - $(date '+%Y-%m-%d %H:%M:%S')"

echo -e "${BLUE}🚀 Pushing to remote...${NC}"
git push

echo -e "${GREEN}✅ Bundle update complete!${NC}"
echo -e "${GREEN}📦 Bundle files updated and pushed to repository${NC}" 