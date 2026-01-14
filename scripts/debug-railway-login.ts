/**
 * Check what permissions are being loaded for restaurant_owner on Railway
 */

import { Client } from 'pg';

const RAILWAY_DATABASE_URL =
  'postgresql://postgres:ZjPzdRlrIuKheirxgEuPFrIYGKecKQyc@switchback.proxy.rlwy.net:57739/railway';

async function checkRailwayLoginPermissions() {
  console.log('🔍 Checking Railway login permissions flow...\n');

  const client = new Client({
    connectionString: RAILWAY_DATABASE_URL,
  });

  try {
    await client.connect();

    // Check what the login API would fetch
    console.log('1️⃣ Checking role_permissions for restaurant_owner...');
    const rolePerms = await client.query(`
      SELECT rp."permissionKey"
      FROM role_permissions rp
      WHERE rp."roleTemplate" = 'restaurant_owner'
      ORDER BY rp."permissionKey";
    `);

    console.log('Permissions count:', rolePerms.rows.length);
    console.log(
      'Permissions:',
      rolePerms.rows.map((r) => r.permissionKey)
    );

    const hasTablesDelete = rolePerms.rows.some(
      (r) => r.permissionKey === 'tables:delete'
    );
    console.log('\n✅ Has tables:delete?', hasTablesDelete);

    // Check if there's a user_permissions override
    console.log('\n2️⃣ Checking for user_permissions overrides...');
    const userPerms = await client.query(`
      SELECT up."userId", up."permissionKey"
      FROM user_permissions up
      JOIN restaurant_owners ro ON ro.id = up."userId"
      WHERE ro.email = 'mario@rossigroup.com';
    `);

    if (userPerms.rows.length > 0) {
      console.log('⚠️  User has custom permissions:', userPerms.rows);
    } else {
      console.log('✅ No user-specific permission overrides');
    }

    // Check user roles
    console.log('\n3️⃣ Checking user roles...');
    const userRoles = await client.query(`
      SELECT ur.id, ur."roleTemplate", ur."customPermissions"
      FROM user_roles ur
      JOIN restaurant_owners ro ON ro.id = ur."userId"
      WHERE ro.email = 'mario@rossigroup.com'
        AND ur."userType" = 'restaurant_owner';
    `);

    console.log('User roles:', userRoles.rows);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.end();
  }
}

checkRailwayLoginPermissions();
