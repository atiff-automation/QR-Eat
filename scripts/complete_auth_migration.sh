#!/bin/bash

# Complete Auth Migration Script
# Systematically migrates ALL remaining files from verifyAuthToken to AuthServiceV2

set -e

cd /Users/atiffriduan/Desktop/QROrder/qr-restaurant-system

echo "=== Auth Migration Script ==="
echo "Finding remaining files..."

# Get all files still using verifyAuthToken
FILES=$(find src/app/api -name "*.ts" -type f -exec grep -l "verifyAuthToken" {} \;)

if [ -z "$FILES" ]; then
  echo "✓ No files remaining to migrate!"
  exit 0
fi

echo "Found files to migrate:"
echo "$FILES" | while read file; do echo "  - $file"; done
echo ""
echo "Total: $(echo "$FILES" | wc -l) files"
echo ""

read -p "Continue with migration? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Migration cancelled."
  exit 1
fi

COUNT=0
SUCCESS=0

# Migrate each file
echo "$FILES" | while read FILE; do
  ((COUNT++))
  echo ""
  echo "[$COUNT] Migrating: $FILE"

  # Create backup
  cp "$FILE" "$FILE.bak"

  # Step 1: Replace import
  sed -i '' 's/import { verifyAuthToken.*from.*@\/lib\/auth.*/import { AuthServiceV2 } from '\''@\/lib\/auth\/rbac\/auth-service'\'';/' "$FILE"
  sed -i '' 's/import {.*verifyAuthToken.*UserType.*}.*from.*@\/lib\/auth.*/import { AuthServiceV2 } from '\''@\/lib\/rbac\/auth-service'\'';/' "$FILE"

  # Step 2: Replace verifyAuthToken calls for staff pattern
  perl -i -p0e 's/const authResult = await verifyAuthToken\(request\);\s*if \(!authResult\.isValid \|\| !authResult\.staff\) \{\s*return NextResponse\.json\(\s*\{ error: '\''Authentication required'\'' \},\s*\{ status: 401 \}\s*\);\s*\}/\/\/ Verify authentication using RBAC system\n    const token = request.cookies.get('\''qr_rbac_token'\'')?.value ||\n                  request.cookies.get('\''qr_auth_token'\'')?.value;\n\n    if (!token) {\n      return NextResponse.json({ error: '\''Authentication required'\'' }, { status: 401 });\n    }\n\n    const authResult = await AuthServiceV2.validateToken(token);\n\n    if (!authResult.isValid || !authResult.user) {\n      return NextResponse.json({ error: '\''Authentication required'\'' }, { status: 401 });\n    }/gs' "$FILE"

  # Step 3: Replace verifyAuthToken calls for user pattern
  perl -i -p0e 's/const authResult = await verifyAuthToken\(request\);\s*if \(!authResult\.isValid \|\| !authResult\.user\) \{\s*return NextResponse\.json\(\s*\{ error: '\''Authentication required'\'' \},\s*\{ status: 401 \}\s*\);\s*\}/\/\/ Verify authentication using RBAC system\n    const token = request.cookies.get('\''qr_rbac_token'\'')?.value ||\n                  request.cookies.get('\''qr_auth_token'\'')?.value;\n\n    if (!token) {\n      return NextResponse.json({ error: '\''Authentication required'\'' }, { status: 401 });\n    }\n\n    const authResult = await AuthServiceV2.validateToken(token);\n\n    if (!authResult.isValid || !authResult.user) {\n      return NextResponse.json({ error: '\''Authentication required'\'' }, { status: 401 });\n    }/gs' "$FILE"

  # Step 4: Replace authResult.staff.restaurantId
  sed -i '' 's/authResult\.staff\.restaurantId/authResult.user.currentRole?.restaurantId/g' "$FILE"

  # Step 5: Replace authResult.user.user.id
  sed -i '' 's/authResult\.user\.user\.id/authResult.user.id/g' "$FILE"

  # Step 6: Replace UserType checks
  sed -i '' 's/authResult\.user\.type === UserType\.PLATFORM_ADMIN/const userType = authResult.user.currentRole?.userType || authResult.user.userType;\n    if (userType === '\''platform_admin'\'')/g' "$FILE"
  sed -i '' 's/authResult\.user\.type === UserType\.RESTAURANT_OWNER/const userType = authResult.user.currentRole?.userType || authResult.user.userType;\n    if (userType === '\''restaurant_owner'\'')/g' "$FILE"
  sed -i '' 's/authResult\.user\.type === UserType\.STAFF/const userType = authResult.user.currentRole?.userType || authResult.user.userType;\n    if (userType === '\''staff'\'')/g' "$FILE"

  sed -i '' 's/authResult\.user\.type !== UserType\.PLATFORM_ADMIN/const userType = authResult.user.currentRole?.userType || authResult.user.userType;\n    if (userType !== '\''platform_admin'\'')/g' "$FILE"
  sed -i '' 's/authResult\.user\.type !== UserType\.RESTAURANT_OWNER/const userType = authResult.user.currentRole?.userType || authResult.user.userType;\n    if (userType !== '\''restaurant_owner'\'')/g' "$FILE"
  sed -i '' 's/authResult\.user\.type !== UserType\.STAFF/const userType = authResult.user.currentRole?.userType || authResult.user.userType;\n    if (userType !== '\''staff'\'')/g' "$FILE"

  # Check if still has verifyAuthToken
  if grep -q "verifyAuthToken" "$FILE"; then
    echo "  ⚠ Still contains verifyAuthToken - may need manual review"
  else
    echo "  ✓ Migration successful"
    ((SUCCESS++))
    rm "$FILE.bak"
  fi
done

echo ""
echo "=== Migration Complete ==="
echo "Successfully migrated: $SUCCESS files"

# Final check
REMAINING=$(find src/app/api -name "*.ts" -type f -exec grep -l "verifyAuthToken" {} \; | wc -l)
echo "Remaining files with verifyAuthToken: $REMAINING"

if [ "$REMAINING" -eq 0 ]; then
  echo "✓ All files migrated successfully!"
else
  echo "⚠ Some files may need manual migration:"
  find src/app/api -name "*.ts" -type f -exec grep -l "verifyAuthToken" {} \;
fi
