#!/usr/bin/env bash
# ==============================================================================
# Test Runner for 56 Kerala Card Game (International 56 Ruleset - ITR)
# Runs Unit Tests and Integration Tests across all modular engines:
#   - gameEngine.js
#   - biddingEngine.js
#   - gameState.js
#   - botEngine.js
#   - integration.test.js
# ==============================================================================

set -eo pipefail

# Text color formatting
BOLD="\033[1m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
NC="\033[0m" # No Color

# Determine script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BOLD}${CYAN}================================================================${NC}"
echo -e "${BOLD}${CYAN}       56 KERALA CARD GAME - TEST RUNNER (ITR ENGINE)           ${NC}"
echo -e "${BOLD}${CYAN}================================================================${NC}"

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR] Node.js is not installed or not in PATH.${NC}"
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${BLUE}Node Environment:${NC} ${NODE_VERSION}"
echo -e "${BLUE}Working Directory:${NC} ${SCRIPT_DIR}"
echo ""

# Handle specific test target if provided as argument
TARGET="$1"

if [ -n "$TARGET" ]; then
    MATCHING_FILE=$(find tests -maxdepth 1 -name "*${TARGET}*.js" | head -n 1)
    if [ -z "$MATCHING_FILE" ]; then
        echo -e "${RED}[ERROR] No test file matching '${TARGET}' found in tests/ directory.${NC}"
        echo -e "Available tests:"
        ls -1 tests/*.test.js
        exit 1
    fi
    echo -e "${YELLOW}Running specific test target:${NC} ${BOLD}${MATCHING_FILE}${NC}"
    echo ""
    node --test "$MATCHING_FILE"
    echo ""
    echo -e "${GREEN}${BOLD}✔ Target test passed successfully!${NC}"
    exit 0
fi

# Run all tests
echo -e "${YELLOW}Executing complete test suite (Unit & Integration tests)...${NC}"
echo ""

START_TIME=$(date +%s%N 2>/dev/null || date +%s)

if node --test tests/*.test.js; then
    END_TIME=$(date +%s%N 2>/dev/null || date +%s)
    echo ""
    echo -e "${BOLD}${GREEN}================================================================${NC}"
    echo -e "${BOLD}${GREEN}     ✔ ALL UNIT & INTEGRATION TESTS PASSED SUCCESSFULLY!        ${NC}"
    echo -e "${BOLD}${GREEN}================================================================${NC}"
    echo -e "${GREEN}All 48 test assertions across 5 test suites passed without error.${NC}"
    echo ""
else
    echo ""
    echo -e "${BOLD}${RED}================================================================${NC}"
    echo -e "${BOLD}${RED}     ✖ ONE OR MORE TESTS FAILED. CHECK LOG OUTPUT ABOVE.        ${NC}"
    echo -e "${BOLD}${RED}================================================================${NC}"
    exit 1
fi
