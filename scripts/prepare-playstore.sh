#!/bin/bash
# Family Graph - Google Play Store Preparation Script
# This script prepares your app for Play Store submission

set -e  # Exit on error

echo "🚀 Family Graph - Play Store Preparation"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running from project root
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Please run this script from the project root directory${NC}"
    exit 1
fi

echo "📋 Step 1: Checking prerequisites..."
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node --version)${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ npm $(npm --version)${NC}"

# Check if ImageMagick is available (for icon conversion)
if command -v magick &> /dev/null || command -v convert &> /dev/null; then
    echo -e "${GREEN}✅ ImageMagick available${NC}"
    HAS_IMAGEMAGICK=true
else
    echo -e "${YELLOW}⚠️  ImageMagick not found - you'll need to create PNG icons manually${NC}"
    HAS_IMAGEMAGICK=false
fi

echo ""
echo "📦 Step 2: Installing Bubblewrap CLI..."
echo ""

if ! npm list -g @bubblewrap/cli &> /dev/null; then
    echo "Installing @bubblewrap/cli globally..."
    npm install -g @bubblewrap/cli
    echo -e "${GREEN}✅ Bubblewrap CLI installed${NC}"
else
    echo -e "${GREEN}✅ Bubblewrap CLI already installed${NC}"
fi

echo ""
echo "🎨 Step 3: Checking manifest and icons..."
echo ""

# Check if manifest exists
if [ ! -f "public/manifest.json" ]; then
    echo -e "${RED}❌ manifest.json not found in public/${NC}"
    exit 1
fi
echo -e "${GREEN}✅ manifest.json found${NC}"

# Check for PNG icons (required for Play Store)
if [ -f "public/playstore-icon-512.png" ]; then
    echo -e "${GREEN}✅ Play Store icon (512x512) exists${NC}"
else
    echo -e "${YELLOW}⚠️  Play Store icon (512x512) not found${NC}"
    if [ "$HAS_IMAGEMAGICK" = true ]; then
        echo "   Creating from SVG..."
        if [ -f "public/icons/icon-512.svg" ]; then
            convert public/icons/icon-512.svg -resize 512x512 public/playstore-icon-512.png
            echo -e "${GREEN}✅ Created playstore-icon-512.png${NC}"
        else
            echo -e "${RED}❌ Source SVG not found${NC}"
        fi
    else
        echo "   Please create manually: public/playstore-icon-512.png (512x512 PNG)"
    fi
fi

if [ -f "public/playstore-icon-192.png" ]; then
    echo -e "${GREEN}✅ Play Store icon (192x192) exists${NC}"
else
    echo -e "${YELLOW}⚠️  Play Store icon (192x192) not found${NC}"
    if [ "$HAS_IMAGEMAGICK" = true ]; then
        echo "   Creating from SVG..."
        if [ -f "public/icons/icon-192.svg" ]; then
            convert public/icons/icon-192.svg -resize 192x192 public/playstore-icon-192.png
            echo -e "${GREEN}✅ Created playstore-icon-192.png${NC}"
        else
            echo -e "${RED}❌ Source SVG not found${NC}"
        fi
    fi
fi

echo ""
echo "🔍 Step 4: Validating manifest for TWA..."
echo ""

# Check critical manifest fields
MANIFEST_CHECKS=0

if grep -q '"start_url"' public/manifest.json; then
    echo -e "${GREEN}✅ start_url defined${NC}"
    ((MANIFEST_CHECKS++))
else
    echo -e "${RED}❌ start_url missing${NC}"
fi

if grep -q '"display".*"standalone"' public/manifest.json; then
    echo -e "${GREEN}✅ display mode is standalone${NC}"
    ((MANIFEST_CHECKS++))
else
    echo -e "${YELLOW}⚠️  display mode should be 'standalone' for TWA${NC}"
fi

if grep -q '"theme_color"' public/manifest.json; then
    echo -e "${GREEN}✅ theme_color defined${NC}"
    ((MANIFEST_CHECKS++))
else
    echo -e "${YELLOW}⚠️  theme_color missing${NC}"
fi

if grep -q '"background_color"' public/manifest.json; then
    echo -e "${GREEN}✅ background_color defined${NC}"
    ((MANIFEST_CHECKS++))
else
    echo -e "${YELLOW}⚠️  background_color missing${NC}"
fi

echo ""
echo "📝 Step 5: Asset Checklist"
echo ""

CHECKLIST_COMPLETE=0
CHECKLIST_TOTAL=6

# Icon 512x512
if [ -f "public/playstore-icon-512.png" ]; then
    echo -e "${GREEN}✅ App icon 512x512${NC}"
    ((CHECKLIST_COMPLETE++))
else
    echo -e "${RED}❌ App icon 512x512 (public/playstore-icon-512.png)${NC}"
fi

# Feature graphic
if [ -f "public/playstore-feature.png" ]; then
    echo -e "${GREEN}✅ Feature graphic 1024x500${NC}"
    ((CHECKLIST_COMPLETE++))
else
    echo -e "${RED}❌ Feature graphic 1024x500 (public/playstore-feature.png)${NC}"
fi

# Screenshots
SCREENSHOT_COUNT=$(find public -name "screenshot*.png" 2>/dev/null | wc -l)
if [ "$SCREENSHOT_COUNT" -ge 2 ]; then
    echo -e "${GREEN}✅ Screenshots ($SCREENSHOT_COUNT found)${NC}"
    ((CHECKLIST_COMPLETE++))
else
    echo -e "${RED}❌ Screenshots (need at least 2, found $SCREENSHOT_COUNT)${NC}"
fi

# Privacy policy
if [ -f "app/(marketing)/legal/page.tsx" ]; then
    echo -e "${GREEN}✅ Privacy policy page exists${NC}"
    ((CHECKLIST_COMPLETE++))
else
    echo -e "${YELLOW}⚠️  Privacy policy page${NC}"
fi

# Service worker
if [ -f "public/sw.js" ]; then
    echo -e "${GREEN}✅ Service worker${NC}"
    ((CHECKLIST_COMPLETE++))
else
    echo -e "${RED}❌ Service worker (public/sw.js)${NC}"
fi

# Build output
if [ -d ".next" ]; then
    echo -e "${GREEN}✅ Production build exists${NC}"
    ((CHECKLIST_COMPLETE++))
else
    echo -e "${YELLOW}⚠️  No production build found (run 'npm run build')${NC}"
fi

echo ""
echo "=========================================="
echo -e "Checklist: ${CHECKLIST_COMPLETE}/${CHECKLIST_TOTAL} items complete"
echo "=========================================="
echo ""

# Final recommendations
echo "📌 Next Steps:"
echo ""
echo "1. Deploy your app to production (Vercel/your domain)"
echo "   Your manifest must be accessible at: https://yourdomain.com/manifest.json"
echo ""
echo "2. Create missing assets:"
if [ ! -f "public/playstore-icon-512.png" ]; then
    echo "   - App icon 512x512 PNG"
fi
if [ ! -f "public/playstore-feature.png" ]; then
    echo "   - Feature graphic 1024x500 PNG"
fi
if [ "$SCREENSHOT_COUNT" -lt 2 ]; then
    echo "   - At least 2 screenshots (1080x1920 or similar)"
fi
echo ""
echo "3. Initialize TWA with Bubblewrap:"
echo "   npx @bubblewrap/cli init --manifest https://yourdomain.com/manifest.json"
echo ""
echo "4. Follow the complete guide: GOOGLE_PLAY_LAUNCH_GUIDE.md"
echo ""

if [ "$CHECKLIST_COMPLETE" -eq "$CHECKLIST_TOTAL" ]; then
    echo -e "${GREEN}🎉 You're ready to build your TWA!${NC}"
else
    echo -e "${YELLOW}⚠️  Complete the checklist above before proceeding${NC}"
fi

echo ""
