import { Pool } from 'pg';

const connectionString =
  'postgresql://postgres:KiWqqGjkOHwMFISVFjmuHMIlgqrJYRcx@centerbeam.proxy.rlwy.net:54297/railway';

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function checkInvalidStatus() {
  try {
    console.log('Connecting to database...');

    // 1. Check specific order
    console.log('\n--- Checking Order ORD-971032-931 ---');
    const specificOrder = await pool.query(`
      SELECT id, "orderNumber", status, "paymentStatus", "createdAt", "servedAt"
      FROM orders 
      WHERE "orderNumber" = 'ORD-971032-931'
    `);
    console.table(specificOrder.rows);

    // 2. Find all orders with INVALID status='completed' (should be 'served' or 'cancelled')
    console.log('\n--- Orders with INVALID status=completed ---');
    const invalidStatusOrders = await pool.query(`
      SELECT id, "orderNumber", status, "paymentStatus", "createdAt", "servedAt"
      FROM orders 
      WHERE status = 'completed'
      ORDER BY "createdAt" DESC
      LIMIT 50
    `);
    console.log(
      `Found ${invalidStatusOrders.rowCount} orders with invalid status='completed'.`
    );
    console.table(invalidStatusOrders.rows);

    // 3. Count total orders with this issue
    console.log('\n--- Total count of orders with status=completed ---');
    const totalCount = await pool.query(`
      SELECT COUNT(*) as total
      FROM orders 
      WHERE status = 'completed'
    `);
    console.table(totalCount.rows);

    // 4. Count by date
    console.log('\n--- Count of invalid status orders by date ---');
    const countByDate = await pool.query(`
      SELECT DATE("createdAt") as date, COUNT(*) as count
      FROM orders 
      WHERE status = 'completed'
      GROUP BY DATE("createdAt")
      ORDER BY date DESC
      LIMIT 10
    `);
    console.table(countByDate.rows);
  } catch (err) {
    console.error('Error querying database:', err);
  } finally {
    await pool.end();
  }
}

checkInvalidStatus();
