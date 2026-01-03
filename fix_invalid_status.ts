import { Pool } from 'pg';

const connectionString =
  'postgresql://postgres:KiWqqGjkOHwMFISVFjmuHMIlgqrJYRcx@centerbeam.proxy.rlwy.net:54297/railway';

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function fixInvalidStatus() {
  const client = await pool.connect();
  try {
    console.log('Starting fix for orders with invalid status=completed...');
    await client.query('BEGIN');

    // Fix all orders with invalid status='completed'
    // Change them to status='served' (the correct ordering cycle status)
    console.log('Fixing orders with status=completed...');
    const orderUpdate = await client.query(`
      UPDATE orders 
      SET status = 'served',
          "servedAt" = COALESCE("servedAt", NOW())
      WHERE status = 'completed'
    `);
    console.log(`Fixed ${orderUpdate.rowCount} orders.`);

    // Show sample of fixed orders
    const sampleFixed = await client.query(`
      SELECT id, "orderNumber", status, "paymentStatus", "createdAt"
      FROM orders 
      WHERE status = 'served'
      AND "servedAt" > NOW() - INTERVAL '1 minute'
      LIMIT 10
    `);
    console.log('\nSample of fixed orders:');
    console.table(sampleFixed.rows);

    await client.query('COMMIT');
    console.log('\nFix completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during fix:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

fixInvalidStatus();
