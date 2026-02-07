#!/bin/bash

# Quick script to test Docker build locally before deploying

set -e

echo "=========================================="
echo "Testing Polygonmoneyflow Docker Build"
echo "=========================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check bun version locally
echo -e "\n${YELLOW}[1/5]${NC} Checking local bun version..."
if command -v bun &> /dev/null; then
    BUN_VERSION=$(bun --version)
    echo -e "${GREEN}✓${NC} Bun version: $BUN_VERSION"
else
    echo -e "${RED}✗${NC} Bun not found locally (not critical for Docker build)"
fi

# Test 2: Validate package.json
echo -e "\n${YELLOW}[2/5]${NC} Validating package.json..."
if [ -f "package.json" ]; then
    if bun run --dry-run start &> /dev/null || node -e "require('./package.json')" &> /dev/null; then
        echo -e "${GREEN}✓${NC} package.json is valid"
    else
        echo -e "${RED}✗${NC} package.json has issues"
        exit 1
    fi
else
    echo -e "${RED}✗${NC} package.json not found"
    exit 1
fi

# Test 3: Try main Dockerfile
echo -e "\n${YELLOW}[3/5]${NC} Building with main Dockerfile..."
if timeout 900 docker build --progress=plain -t polygonmoneyflow:test . 2>&1 | tee build.log; then
    echo -e "${GREEN}✓${NC} Main Dockerfile build successful!"
    BUILD_SUCCESS=true
else
    echo -e "${RED}✗${NC} Main Dockerfile build failed"
    BUILD_SUCCESS=false
    
    # Check for segfault
    if grep -q "signal 11\|segfault\|139" build.log; then
        echo -e "${YELLOW}!${NC} Detected segmentation fault"
    fi
fi

# Test 4: If main failed, try fast Dockerfile
if [ "$BUILD_SUCCESS" = false ] && [ -f "Dockerfile.fast" ]; then
    echo -e "\n${YELLOW}[4/5]${NC} Trying alternative Dockerfile.fast..."
    if timeout 900 docker build --progress=plain -f Dockerfile.fast -t polygonmoneyflow:test-fast . 2>&1 | tee build-fast.log; then
        echo -e "${GREEN}✓${NC} Fast Dockerfile build successful!"
        BUILD_SUCCESS=true
        echo -e "${YELLOW}→${NC} Use Dockerfile.fast for deployment"
    else
        echo -e "${RED}✗${NC} Fast Dockerfile also failed"
    fi
fi

# Test 5: Test the built image
if [ "$BUILD_SUCCESS" = true ]; then
    echo -e "\n${YELLOW}[5/5]${NC} Testing built image..."
    
    # Test bun version in container
    if docker run --rm polygonmoneyflow:test bun --version; then
        echo -e "${GREEN}✓${NC} Container bun works"
    else
        echo -e "${RED}✗${NC} Container bun failed"
    fi
    
    # Test if source files are present
    if docker run --rm polygonmoneyflow:test ls -la src/app.ts; then
        echo -e "${GREEN}✓${NC} Source files present"
    else
        echo -e "${RED}✗${NC} Source files missing"
    fi
fi

# Summary
echo -e "\n=========================================="
if [ "$BUILD_SUCCESS" = true ]; then
    echo -e "${GREEN}✓ BUILD SUCCESSFUL${NC}"
    echo "You can now deploy with ./deploy.sh --walletSystem"
    echo ""
    echo "To test locally:"
    echo "  docker compose up"
else
    echo -e "${RED}✗ BUILD FAILED${NC}"
    echo ""
    echo "Troubleshooting steps:"
    echo "1. Check build.log for errors"
    echo "2. Try: bun install (locally)"
    echo "3. Read DOCKER_TROUBLESHOOTING.md"
    echo "4. Try building without cache:"
    echo "   docker build --no-cache -t polygonmoneyflow:test ."
fi
echo "=========================================="

# Cleanup
rm -f build.log build-fast.log
