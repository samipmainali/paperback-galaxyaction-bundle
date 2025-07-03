#!/bin/bash

# Script to build bundles and update only bundle files in git
# This script will:
# 1. Build the bundles (using source files)
# 2. Add only bundle files to git (ignoring source files)
# 3. Commit and push the changes

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 Building bundles...${NC}"
npm run bundle

echo -e "${BLUE}📁 Adding bundle files to git...${NC}"
git add bundles/

echo -e "${BLUE}📝 Committing bundle updates...${NC}"
git commit -m "Update GalaxyAction bundle - $(date '+%Y-%m-%d %H:%M:%S')"

echo -e "${BLUE}🚀 Pushing to remote...${NC}"
git push

echo -e "${GREEN}✅ Bundle build and update complete!${NC}"
echo -e "${GREEN}📦 Bundle files built, committed, and pushed to repository${NC}" 