/**
 * Test timezone handling
 */

// Simulate order from database (stored in UTC)
const orderCreatedAt = '2026-01-03T06:00:00.000Z'; // 6 AM UTC = 2 PM GMT+8

console.log('=== Timezone Test ===');
console.log('Order from DB (UTC):', orderCreatedAt);

// Browser creates date in local timezone
const orderDate = new Date(orderCreatedAt);
console.log('Parsed in browser:', orderDate.toString());
console.log('ISO String:', orderDate.toISOString());
console.log(
  'Local String:',
  orderDate.toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })
);

// Current approach (WRONG - uses local timezone)
const today = new Date();
today.setHours(0, 0, 0, 0);
console.log('\n=== Current Approach (Local Timezone) ===');
console.log('Today midnight (local):', today.toString());
console.log('Today midnight (ISO):', today.toISOString());

const isOldWrong = orderDate.getTime() < today.getTime();
console.log('Is old?', isOldWrong);

// Correct approach (use UTC for comparison)
const todayUTC = new Date();
todayUTC.setUTCHours(0, 0, 0, 0);
console.log('\n=== Correct Approach (UTC) ===');
console.log('Today midnight (UTC):', todayUTC.toISOString());

const isOldCorrect = orderDate.getTime() < todayUTC.getTime();
console.log('Is old?', isOldCorrect);

// Better approach: Compare date strings
const orderDateOnly = orderDate.toISOString().split('T')[0];
const todayDateOnly = new Date().toISOString().split('T')[0];
console.log('\n=== Best Approach (Date String Comparison) ===');
console.log('Order date:', orderDateOnly);
console.log('Today date:', todayDateOnly);
console.log('Is old?', orderDateOnly < todayDateOnly);
