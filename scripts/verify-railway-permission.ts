/**
 * Verify tables:delete permission in Railway database
 */

import { Client } from 'pg';

const RAILWAY_DATABASE_URL =
  'postgresql://postgres:ZjPzdRlrIuKheirxgEuPFrIYGKecKQyc@switchback.proxy.rlwy.net:57739/railway';

async function verifyRailwayPermission() {
  console.log('🔍 Checking Railway database...\n');

  const client = new Client({
    connectionString: RAILWAY_DATABASE_URL,
  });

  try {
    await client.connect();

    // Check permissions table
    console.log('1️⃣ Checking permissions table...');
    const permResult = await client.query(`
      SELECT * FROM permissions WHERE "permissionKey" = 'tables:delete';
    `);
    console.log('Result:', permResult.rows);

    // Check role_permissions table
    console.log('\n2️⃣ Checking role_permissions table...');
    const rolePermResult = await client.query(`
      SELECT * FROM role_permissions 
      WHERE "roleTemplate" = 'restaurant_owner' 
        AND "permissionKey" = 'tables:delete';
    `);
    console.log('Result:', rolePermResult.rows);

    // Check all restaurant_owner permissions
    console.log('\n3️⃣ All restaurant_owner permissions:');
    const allPerms = await client.query(`
      SELECT "permissionKey" FROM role_permissions 
      WHERE "roleTemplate" = 'restaurant_owner'
      ORDER BY "permissionKey";
    `);
    console.log(
      'Permissions:',
      allPerms.rows.map((r) => r.permissionKey)
    );

    if (permResult.rows.length > 0 && rolePermResult.rows.length > 0) {
      console.log('\n✅ Permission exists in Railway database!');
      console.log(
        '\n⚠️  If delete still fails, you MUST logout and login on Railway to refresh your session.'
      );
    } else {
      console.log('\n❌ Permission NOT found in Railway database!');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.end();
  }
}

verifyRailwayPermission();
