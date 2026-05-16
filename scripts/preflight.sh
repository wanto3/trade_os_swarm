#!/usr/bin/env bash
#
# Preflight check — runs the same steps Render's build will run, so we
# catch failures locally BEFORE pushing. User requested after a deploy
# scare: "make sure you double check the code before deployment so
# nothing breaks".
#
# Run before any push:
#   bash scripts/preflight.sh
# Or via npm:
#   npm run preflight
#
# Exits non-zero on the first failure; prints a clear pass/fail summary
# at the end. Skips known-flaky integration tests (apiIntegration.test.ts
# requires a running Express server on localhost and isn't part of the
# Render build path).

set -u

red=$'\033[31m'
green=$'\033[32m'
yellow=$'\033[33m'
reset=$'\033[0m'

fail() {
  echo "${red}✗ FAIL: $1${reset}" >&2
  echo
  echo "${red}Preflight FAILED. Do not push.${reset}" >&2
  exit 1
}

ok() {
  echo "${green}✓ PASS: $1${reset}"
}

skip() {
  echo "${yellow}⚠ SKIP: $1${reset}"
}

echo "Running Render-equivalent preflight checks..."
echo

# 1. TypeScript: same as Render's build will check
echo "[1/3] TypeScript check (tsc --noEmit)..."
if npx tsc --noEmit 2>&1 | tee /tmp/preflight-tsc.log | grep -qE "error TS"; then
  cat /tmp/preflight-tsc.log >&2
  fail "TypeScript errors detected"
fi
ok "no TypeScript errors"
echo

# 2. Full Next.js build — what Render actually runs
echo "[2/3] Next.js build (npm run build) — this is exactly what Render runs..."
if ! npm run build > /tmp/preflight-build.log 2>&1; then
  tail -60 /tmp/preflight-build.log >&2
  fail "next build failed — Render will fail the same way"
fi
# Check for any 'Error' or 'Failed' in build output (warnings are fine)
if grep -E "^\s*Error|Failed to compile|build failed" /tmp/preflight-build.log; then
  fail "build emitted error markers"
fi
ok "next build completed cleanly"
echo

# 3. Unit tests — exclude flaky integration tests that need a separate server
echo "[3/3] Unit tests (excluding apiIntegration which needs a running Express server)..."
if ! npx vitest run --exclude "**/apiIntegration.test.ts" > /tmp/preflight-tests.log 2>&1; then
  tail -40 /tmp/preflight-tests.log >&2
  fail "unit tests failed"
fi
PASSED=$(grep -oE "[0-9]+ passed" /tmp/preflight-tests.log | tail -1)
ok "unit tests passed (${PASSED:-unknown})"
echo

echo "${green}══════════════════════════════════════════${reset}"
echo "${green}✓ ALL PREFLIGHT CHECKS PASSED${reset}"
echo "${green}══════════════════════════════════════════${reset}"
echo
echo "Safe to push. Render should accept the build."
