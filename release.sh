#!/bin/bash

# Obsidian Plugin Release Script
# Handles version bumping, building, and git tagging

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# File paths
MANIFEST_FILE="manifest.json"
PACKAGE_FILE="package.json"
VERSIONS_FILE="versions.json"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Obsidian Plugin Release Script       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if required files exist
for file in "$MANIFEST_FILE" "$PACKAGE_FILE" "$VERSIONS_FILE"; do
    if [[ ! -f "$file" ]]; then
        echo -e "${RED}Error: $file not found!${NC}"
        exit 1
    fi
done

# Extract current versions
MANIFEST_VERSION=$(grep '"version"' "$MANIFEST_FILE" | sed 's/.*"version": *"\([^"]*\)".*/\1/')
PACKAGE_VERSION=$(grep '"version"' "$PACKAGE_FILE" | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
MIN_APP_VERSION=$(grep '"minAppVersion"' "$MANIFEST_FILE" | sed 's/.*"minAppVersion": *"\([^"]*\)".*/\1/')

echo -e "${YELLOW}Current Versions:${NC}"
echo -e "  manifest.json:  ${GREEN}$MANIFEST_VERSION${NC}"
echo -e "  package.json:   ${GREEN}$PACKAGE_VERSION${NC}"
echo -e "  minAppVersion:  ${BLUE}$MIN_APP_VERSION${NC}"
echo ""

# Check if versions are in sync
if [[ "$MANIFEST_VERSION" != "$PACKAGE_VERSION" ]]; then
    echo -e "${RED}⚠ Warning: Versions are out of sync!${NC}"
    echo -e "  Using manifest.json version: $MANIFEST_VERSION"
    CURRENT_VERSION="$MANIFEST_VERSION"
else
    CURRENT_VERSION="$MANIFEST_VERSION"
fi

# Parse current version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Beta versioning - stay within 0.0.xxx
# Calculate new versions: small (+1), medium (+10), big (+100)
NEW_SMALL="$MAJOR.$MINOR.$((PATCH + 1))"
NEW_MEDIUM="$MAJOR.$MINOR.$((PATCH + 10))"
NEW_BIG="$MAJOR.$MINOR.$((PATCH + 100))"
NEW_STABLE="$MAJOR.$((MINOR + 1)).0"

echo -e "${YELLOW}🧪 BETA Release Mode (0.0.xxx)${NC}"
echo ""
echo -e "${YELLOW}Select release type:${NC}"
echo -e "  ${GREEN}1)${NC} Small   → $NEW_SMALL   (+1: bug fix, tweak)"
echo -e "  ${GREEN}2)${NC} Medium  → $NEW_MEDIUM   (+10: feature update)"
echo -e "  ${GREEN}3)${NC} Big     → $NEW_BIG  (+100: significant changes)"
echo -e "  ${BLUE}4)${NC} Stable  → $NEW_STABLE  (exit beta, go stable)"
echo -e "  ${RED}5)${NC} Cancel"
echo ""

read -p "Enter choice [1-5]: " choice

case $choice in
    1) NEW_VERSION="$NEW_SMALL" ;;
    2) NEW_VERSION="$NEW_MEDIUM" ;;
    3) NEW_VERSION="$NEW_BIG" ;;
    4) 
        echo -e "${YELLOW}⚠ This will exit beta and release 0.1.0${NC}"
        read -p "Are you sure? [y/N]: " confirm
        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}Release cancelled.${NC}"
            exit 0
        fi
        NEW_VERSION="$NEW_STABLE"
        ;;
    5) echo -e "${YELLOW}Release cancelled.${NC}"; exit 0 ;;
    *) echo -e "${RED}Invalid choice. Exiting.${NC}"; exit 1 ;;
esac

echo ""
echo -e "${BLUE}Updating to version: ${GREEN}$NEW_VERSION${NC}"
echo ""

# Update package.json
echo -e "  Updating ${YELLOW}package.json${NC}..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$PACKAGE_FILE"
else
    # Linux
    sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$PACKAGE_FILE"
fi

# Update manifest.json
echo -e "  Updating ${YELLOW}manifest.json${NC}..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$MANIFEST_FILE"
else
    sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$MANIFEST_FILE"
fi

# Update versions.json (add new version mapping)
echo -e "  Updating ${YELLOW}versions.json${NC}..."
# Read current versions.json and add new entry
node -e "
const fs = require('fs');
const versions = JSON.parse(fs.readFileSync('$VERSIONS_FILE', 'utf8'));
versions['$NEW_VERSION'] = '$MIN_APP_VERSION';
fs.writeFileSync('$VERSIONS_FILE', JSON.stringify(versions, null, '\t'));
"

echo -e "${GREEN}✓ Version files updated${NC}"
echo ""

# Build the project
echo -e "${BLUE}Building project...${NC}"
npm run build
echo -e "${GREEN}✓ Build complete${NC}"
echo ""

# Check if main.js was created
if [[ ! -f "main.js" ]]; then
    echo -e "${RED}Error: main.js was not created during build!${NC}"
    exit 1
fi

# Git operations
echo -e "${YELLOW}Git Operations:${NC}"
read -p "Create git commit and tag? [y/N]: " git_choice

if [[ "$git_choice" =~ ^[Yy]$ ]]; then
    # Check for uncommitted changes
    if [[ -n $(git status --porcelain) ]]; then
        echo -e "  Adding changes..."
        git add -A
        echo -e "  Creating commit..."
        git commit -m "Release v$NEW_VERSION"
    fi
    
    echo -e "  Creating tag ${GREEN}$NEW_VERSION${NC}..."
    git tag "$NEW_VERSION"
    
    echo -e "${GREEN}✓ Git commit and tag created${NC}"
    echo ""
    
    read -p "Push to remote (including tags)? [y/N]: " push_choice
    if [[ "$push_choice" =~ ^[Yy]$ ]]; then
        echo -e "  Pushing to remote..."
        git push && git push --tags
        echo -e "${GREEN}✓ Pushed to remote${NC}"
    fi
    
    # GitHub Release with gh CLI
    echo ""
    echo -e "${YELLOW}GitHub Release:${NC}"
    
    # Check if gh is installed
    if ! command -v gh &> /dev/null; then
        echo -e "${RED}GitHub CLI (gh) not installed. Skipping release creation.${NC}"
        echo -e "  Install with: ${BLUE}brew install gh${NC}"
        echo ""
        echo -e "${YELLOW}Manual steps:${NC}"
        echo -e "  1. Create release at: https://github.com/mromasu/obsidian-sample-plugin/releases/new"
        echo -e "  2. Use tag: ${GREEN}$NEW_VERSION${NC}"
        echo -e "  3. Attach: main.js, manifest.json, styles.css"
    else
        read -p "Create GitHub release with assets? [y/N]: " release_choice
        if [[ "$release_choice" =~ ^[Yy]$ ]]; then
            echo -e "  Creating GitHub release ${GREEN}$NEW_VERSION${NC}..."
            
            # Build release assets list
            ASSETS="main.js manifest.json"
            if [[ -f "styles.css" ]]; then
                ASSETS="$ASSETS styles.css"
            fi
            
            # Create release with assets
            # --generate-notes auto-generates release notes from commits
            gh release create "$NEW_VERSION" \
                --title "v$NEW_VERSION" \
                --generate-notes \
                --prerelease \
                $ASSETS
            
            echo -e "${GREEN}✓ GitHub release created with assets${NC}"
            echo -e "  View at: ${BLUE}$(gh release view "$NEW_VERSION" --json url -q .url)${NC}"
        fi
    fi
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Release $NEW_VERSION complete! 🚀        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
