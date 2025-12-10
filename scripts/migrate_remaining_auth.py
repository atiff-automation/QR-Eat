#!/usr/bin/env python3
"""
Automated Auth Migration Script
Migrates remaining API endpoints from verifyAuthToken to AuthServiceV2.validateToken
"""

import os
import re
import subprocess
from pathlib import Path

# RBAC auth template
RBAC_AUTH_TEMPLATE = """// Verify authentication using RBAC system
    const token = request.cookies.get('qr_rbac_token')?.value ||
                  request.cookies.get('qr_auth_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const authResult = await AuthServiceV2.validateToken(token);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }"""

def find_files_with_deprecated_auth():
    """Find all TypeScript files still using verifyAuthToken"""
    result = subprocess.run(
        ['find', 'src/app/api', '-name', '*.ts', '-type', 'f'],
        capture_output=True,
        text=True
    )

    files = []
    for file_path in result.stdout.strip().split('\n'):
        if not file_path:
            continue
        with open(file_path, 'r') as f:
            content = f.read()
            if 'verifyAuthToken' in content:
                files.append(file_path)

    return files

def migrate_file(file_path):
    """Migrate a single file from verifyAuthToken to AuthServiceV2"""
    print(f"Migrating: {file_path}")

    with open(file_path, 'r') as f:
        content = f.read()

    original_content = content

    # Replace import statement
    content = re.sub(
        r'import\s+{[^}]*verifyAuthToken[^}]*}\s+from\s+[\'"]@/lib/auth[\'"];?',
        "import { AuthServiceV2 } from '@/lib/rbac/auth-service';",
        content
    )

    # Remove UserType import if it exists and isn't used elsewhere
    if 'UserType.PLATFORM_ADMIN' not in content and 'UserType.RESTAURANT_OWNER' not in content and 'UserType.STAFF' not in content:
        content = re.sub(r',\s*UserType', '', content)
        content = re.sub(r'UserType\s*,', '', content)

    # Replace verifyAuthToken calls - Pattern 1: Staff only
    content = re.sub(
        r'const authResult = await verifyAuthToken\(request\);\s*if\s*\(!authResult\.isValid\s*\|\|\s*!authResult\.staff\)\s*{\s*return NextResponse\.json\(\s*{\s*error:\s*[\'"]Authentication required[\'"]\s*},\s*{\s*status:\s*401\s*}\s*\);\s*}',
        RBAC_AUTH_TEMPLATE,
        content,
        flags=re.DOTALL
    )

    # Replace verifyAuthToken calls - Pattern 2: User only
    content = re.sub(
        r'const authResult = await verifyAuthToken\(request\);\s*if\s*\(!authResult\.isValid\s*\|\|\s*!authResult\.user\)\s*{\s*return NextResponse\.json\(\s*{\s*error:\s*[\'"]Authentication required[\'"]\s*},\s*{\s*status:\s*401\s*}\s*\);\s*}',
        RBAC_AUTH_TEMPLATE,
        content,
        flags=re.DOTALL
    )

    # Replace authResult.staff.restaurantId with user Role-based access
    content = re.sub(
        r'authResult\.staff\.restaurantId',
        "authResult.user.currentRole?.restaurantId",
        content
    )

    # Replace authResult.user.user.id with authResult.user.id
    content = re.sub(
        r'authResult\.user\.user\.id',
        "authResult.user.id",
        content
    )

    # Replace authResult.user.type with currentRole userType
    content = re.sub(
        r'authResult\.user\.type\s*===\s*UserType\.PLATFORM_ADMIN',
        "const userType = authResult.user.currentRole?.userType || authResult.user.userType;\n    if (userType !== 'platform_admin')",
        content
    )

    content = re.sub(
        r'authResult\.user\.type\s*===\s*UserType\.RESTAURANT_OWNER',
        "const userType = authResult.user.currentRole?.userType || authResult.user.userType;\n    if (userType !== 'restaurant_owner')",
        content
    )

    content = re.sub(
        r'authResult\.user\.type\s*===\s*UserType\.STAFF',
        "const userType = authResult.user.currentRole?.userType || authResult.user.userType;\n    if (userType !== 'staff')",
        content
    )

    # Only write if content changed
    if content != original_content:
        with open(file_path, 'w') as f:
            f.write(content)
        print(f"  ✓ Migrated successfully")
        return True
    else:
        print(f"  ⚠ No changes needed or complex pattern requiring manual migration")
        return False

def main():
    print("=== Auth Migration Tool ===")
    print("Finding files with deprecated auth...")

    # Change to project root
    os.chdir('/Users/atiffriduan/Desktop/QROrder/qr-restaurant-system')

    files = find_files_with_deprecated_auth()

    print(f"\nFound {len(files)} files to migrate:\n")
    for f in files:
        print(f"  - {f}")

    print("\n" + "="*50)
    input("Press Enter to start migration...")

    migrated = 0
    for file_path in files:
        if migrate_file(file_path):
            migrated += 1

    print("\n" + "="*50)
    print(f"Migration complete!")
    print(f"Successfully migrated: {migrated}/{len(files)} files")

    # Check remaining
    remaining = find_files_with_deprecated_auth()
    if remaining:
        print(f"\n⚠ {len(remaining)} files still need manual migration:")
        for f in remaining:
            print(f"  - {f}")
    else:
        print("\n✓ All files migrated successfully!")

if __name__ == '__main__':
    main()
