import { Pool } from 'pg';

const connectionString =
  'postgresql://postgres:KiWqqGjkOHwMFISVFjmuHMIlgqrJYRcx@centerbeam.proxy.rlwy.net:54297/railway';

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function cleanupTables() {
  const client = await pool.connect();
  try {
    console.log('Starting cleanup for Tables 1 and 2...');
    await client.query('BEGIN');

    // 1. Close Active Customer Sessions
    console.log('Closing active customer sessions...');
    const sessionUpdate = await client.query(`
      UPDATE customer_sessions 
      SET status = 'completed', "endedAt" = NOW() 
      WHERE "tableId" IN (SELECT id FROM tables WHERE "tableNumber" IN ('1', '2')) 
      AND status = 'active'
    `);
    console.log(`Updated ${sessionUpdate.rowCount} customer sessions.`);

    // 2. Complete Stale Orders
    // We mark them as completed and paid to get them out of the "Occupied" check logic
    console.log('Completing stale orders...');
    const orderUpdate = await client.query(`
      UPDATE orders 
      SET status = 'completed', 
          "paymentStatus" = 'paid',
          "servedAt" = COALESCE("servedAt", NOW())
      WHERE "tableId" IN (SELECT id FROM tables WHERE "tableNumber" IN ('1', '2')) 
      AND status NOT IN ('cancelled', 'completed', 'refunded')
    `);
    console.log(`Updated ${orderUpdate.rowCount} orders.`);

    // 3. Reset Table Status
    console.log('Resetting table status to available...');
    const tableUpdate = await client.query(`
      UPDATE tables 
      SET status = 'available' 
      WHERE "tableNumber" IN ('1', '2')
    `);
    console.log(`Updated ${tableUpdate.rowCount} tables.`);

    await client.query('COMMIT');
    console.log('Cleanup completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during cleanup:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

cleanupTables();
