/**
 * Add tables:delete permission to Railway database
 */

import { Client } from 'pg';

const RAILWAY_DATABASE_URL =
  'postgresql://postgres:ZjPzdRlrIuKheirxgEuPFrIYGKecKQyc@switchback.proxy.rlwy.net:57739/railway';

async function addTablesDeletePermissionToRailway() {
  console.log('🚂 Connecting to Railway database...\n');

  const client = new Client({
    connectionString: RAILWAY_DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✅ Connected to Railway database\n');

    // Step 1: Create the permission in permissions table
    console.log('1️⃣ Creating permission in permissions table...');
    await client.query(`
      INSERT INTO permissions (id, "permissionKey", description, category, "isActive", "createdAt")
      VALUES (gen_random_uuid(), 'tables:delete', 'Delete tables', 'tables', true, NOW())
      ON CONFLICT ("permissionKey") DO NOTHING;
    `);
    console.log('✅ Permission created');

    // Step 2: Add to restaurant_owner role
    console.log('\n2️⃣ Adding permission to restaurant_owner role...');
    await client.query(`
      INSERT INTO role_permissions (id, "roleTemplate", "permissionKey", "grantedAt")
      VALUES (gen_random_uuid(), 'restaurant_owner', 'tables:delete', NOW())
      ON CONFLICT ("roleTemplate", "permissionKey") DO NOTHING;
    `);
    console.log('✅ Added to restaurant_owner role');

    // Step 3: Verify
    console.log('\n3️⃣ Verifying...');
    const result = await client.query(`
      SELECT rp."roleTemplate", rp."permissionKey"
      FROM role_permissions rp
      WHERE rp."roleTemplate" = 'restaurant_owner'
        AND rp."permissionKey" = 'tables:delete';
    `);

    if (result.rows.length > 0) {
      console.log('✅ Verified: Permission exists in Railway database');
    } else {
      console.log('❌ Verification failed');
    }

    console.log(
      '\n🎉 Done! Logout and login on Railway to get the permission.'
    );
  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  } finally {
    await client.end();
    console.log('\n👋 Disconnected from Railway database');
  }
}

addTablesDeletePermissionToRailway();
