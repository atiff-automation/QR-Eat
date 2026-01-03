import { Pool } from 'pg';

const connectionString =
  'postgresql://postgres:KiWqqGjkOHwMFISVFjmuHMIlgqrJYRcx@centerbeam.proxy.rlwy.net:54297/railway';

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function checkTables() {
  try {
    console.log('Connecting to database...');

    // 1. Check Table Status
    console.log('\n--- Table Status ---');
    const tableRes = await pool.query(`
      SELECT id, "tableNumber", status, "updatedAt"
      FROM tables 
      WHERE "tableNumber" IN ('1', '2')
    `);
    console.table(tableRes.rows);

    // 2. Count Active Orders
    console.log(
      '\n--- Count of Non-Terminal Orders (pending, served, etc) ---'
    );
    const orderCountRes = await pool.query(`
      SELECT t."tableNumber", COUNT(*) as count
      FROM orders o
      JOIN tables t ON o."tableId" = t.id
      WHERE t."tableNumber" IN ('1', '2')
      AND o.status NOT IN ('cancelled', 'completed', 'refunded')
      GROUP BY t."tableNumber"
    `);
    console.table(orderCountRes.rows);

    // 3. Count Active Customer Sessions
    console.log('\n--- Count of Active Customer Sessions ---');
    const sessionCountRes = await pool.query(`
      SELECT t."tableNumber", COUNT(*) as count
      FROM customer_sessions cs
      JOIN tables t ON cs."tableId" = t.id
      WHERE t."tableNumber" IN ('1', '2')
      AND cs.status = 'active'
      GROUP BY t."tableNumber"
    `);
    console.table(sessionCountRes.rows);
  } catch (err) {
    console.error('Error querying database:', err);
  } finally {
    await pool.end();
  }
}

checkTables();
