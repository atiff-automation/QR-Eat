/**
 * Check for any remaining lowercase status values
 */

import { Client } from 'pg';

const connectionString =
  'postgresql://postgres:KiWqqGjkOHwMFISVFjmuHMIlgqrJYRcx@centerbeam.proxy.rlwy.net:54297/railway';

async function checkStatusValues() {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Check orders
    const orders = await client.query(
      `SELECT status, "paymentStatus" FROM orders LIMIT 5`
    );
    console.log('Sample order statuses:');
    console.table(orders.rows);

    // Check tables
    const tables = await client.query(
      `SELECT "tableNumber", status FROM tables LIMIT 5`
    );
    console.log('\nSample table statuses:');
    console.table(tables.rows);

    // Check sessions
    const sessions = await client.query(
      `SELECT status FROM customer_sessions LIMIT 5`
    );
    console.log('\nSample session statuses:');
    console.table(sessions.rows);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

checkStatusValues();
