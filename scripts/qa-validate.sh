#!/bin/bash
# QA Agent - Quick validation script
# Run this before committing or deploying changes

echo "🧪 QA Agent: Validating codebase..."

echo ""
echo "1️⃣ Running TypeScript type check..."
npm run type-check
TYPE_STATUS=$?

echo ""
echo "2️⃣ Running ESLint..."
npm run lint
LINT_STATUS=$?

echo ""
echo "3️⃣ Checking for console.log statements..."
LOG_COUNT=$(grep -r "console.log" app/ --include="*.tsx" --include="*.ts" | grep -v "console.error" | grep -v "eslint" | wc -l | tr -d ' ')
if [ "$LOG_COUNT" -gt 0 ]; then
  echo "   ⚠️  Found $LOG_COUNT console.log statements (consider removing for production)"
else
  echo "   ✅ No console.log statements found"
fi

echo ""
echo "4️⃣ Checking page compilation..."
npm run build > /tmp/qa-build.log 2>&1
BUILD_STATUS=$?

if [ $TYPE_STATUS -eq 0 ] && [ $LINT_STATUS -eq 0 ] && [ $BUILD_STATUS -eq 0 ]; then
  echo ""
  echo "✅ All checks passed! Code is ready to deploy."
  echo ""
  echo "   - TypeScript: ✓"
  echo "   - ESLint: ✓"
  echo "   - Build: ✓"
  echo ""
  exit 0
else
  echo ""
  echo "❌ Validation failed! Please fix the errors above."
  echo ""
  [ $TYPE_STATUS -ne 0 ] && echo "   - TypeScript: ✗"
  [ $LINT_STATUS -ne 0 ] && echo "   - ESLint: ✗"
  [ $BUILD_STATUS -ne 0 ] && echo "   - Build: ✗ (check /tmp/qa-build.log)"
  echo ""
  exit 1
fi
