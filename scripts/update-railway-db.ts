/**
 * Update Railway Database - Add INACTIVE Enum
 * Run this script to add INACTIVE value to TableStatus enum on Railway
 */

import { Client } from 'pg';

const RAILWAY_DATABASE_URL =
  'postgresql://postgres:ZjPzdRlrIuKheirxgEuPFrIYGKecKQyc@switchback.proxy.rlwy.net:57739/railway';

async function updateRailwayDatabase() {
  console.log('🚂 Connecting to Railway database...\n');

  const client = new Client({
    connectionString: RAILWAY_DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✅ Connected to Railway database\n');

    // Check current enum values
    console.log('📋 Checking current TableStatus enum values...');
    const checkResult = await client.query(`
      SELECT enumlabel 
      FROM pg_enum 
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
      WHERE pg_type.typname = 'TableStatus'
      ORDER BY enumlabel;
    `);

    console.log(
      'Current values:',
      checkResult.rows.map((r) => r.enumlabel)
    );

    const hasInactive = checkResult.rows.some(
      (r) => r.enumlabel === 'INACTIVE'
    );

    if (hasInactive) {
      console.log('\n✅ INACTIVE value already exists! No update needed.');
      return;
    }

    // Add INACTIVE value
    console.log('\n🔧 Adding INACTIVE value to TableStatus enum...');
    await client.query(`
      ALTER TYPE "TableStatus" ADD VALUE 'INACTIVE';
    `);

    console.log('✅ INACTIVE value added successfully!\n');

    // Verify
    const verifyResult = await client.query(`
      SELECT enumlabel 
      FROM pg_enum 
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
      WHERE pg_type.typname = 'TableStatus'
      ORDER BY enumlabel;
    `);

    console.log(
      '📋 Updated enum values:',
      verifyResult.rows.map((r) => r.enumlabel)
    );
    console.log('\n🎉 Railway database updated successfully!');
  } catch (error) {
    console.error('\n❌ Error updating database:', error);
    throw error;
  } finally {
    await client.end();
    console.log('\n👋 Disconnected from Railway database');
  }
}

updateRailwayDatabase();
