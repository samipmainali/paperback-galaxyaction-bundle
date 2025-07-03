#!/bin/bash

# Comprehensive script to manage bundle files
# Usage: ./manage-bundles.sh [build|commit|push|all]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}🔄 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to build bundles
build_bundles() {
    print_status "Building bundles..."
    npm run bundle
    print_success "Bundles built successfully!"
}

# Function to commit bundle changes
commit_bundles() {
    print_status "Checking for bundle changes..."
    
    if git diff --quiet bundles/; then
        print_warning "No changes detected in bundles folder"
        return 0
    fi
    
    print_status "Adding bundle files to git..."
    git add bundles/
    
    print_status "Committing bundle updates..."
    git commit -m "Update GalaxyAction bundle - $(date '+%Y-%m-%d %H:%M:%S')"
    print_success "Bundle changes committed!"
}

# Function to push changes
push_changes() {
    print_status "Pushing to remote repository..."
    git push
    print_success "Changes pushed successfully!"
}

# Function to show status
show_status() {
    print_status "Current git status:"
    git status --porcelain
}

# Function to show help
show_help() {
    echo "Usage: $0 [OPTION]"
    echo ""
    echo "Options:"
    echo "  build     - Build the bundles only"
    echo "  commit    - Commit bundle changes only"
    echo "  push      - Push committed changes only"
    echo "  all       - Build, commit, and push (default)"
    echo "  status    - Show current git status"
    echo "  help      - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 build    # Build bundles only"
    echo "  $0 all      # Build, commit, and push"
    echo "  $0 status   # Show git status"
}

# Main script logic
case "${1:-all}" in
    "build")
        build_bundles
        ;;
    "commit")
        commit_bundles
        ;;
    "push")
        push_changes
        ;;
    "all")
        build_bundles
        commit_bundles
        push_changes
        print_success "Bundle management complete!"
        ;;
    "status")
        show_status
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    *)
        print_error "Unknown option: $1"
        echo ""
        show_help
        exit 1
        ;;
esac 