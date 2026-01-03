/**
 * Test old order detection logic
 */

// Test case 1: Order created today
const todayOrder = new Date();
console.log('Today Order:', todayOrder.toISOString());

// Test case 2: Order created yesterday
const yesterdayOrder = new Date();
yesterdayOrder.setDate(yesterdayOrder.getDate() - 1);
console.log('Yesterday Order:', yesterdayOrder.toISOString());

// Test case 3: Order created 2 hours ago
const twoHoursAgo = new Date();
twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);
console.log('2 Hours Ago Order:', twoHoursAgo.toISOString());

// Test the logic
function isOldOrder(createdAt: Date): boolean {
  const orderDate = new Date(createdAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set to midnight today

  // Order is old if it was created before today's midnight
  return orderDate.getTime() < today.getTime();
}

console.log('\n=== Test Results ===');
console.log('Today Order is old?', isOldOrder(todayOrder), '(should be false)');
console.log(
  'Yesterday Order is old?',
  isOldOrder(yesterdayOrder),
  '(should be true)'
);
console.log(
  '2 Hours Ago Order is old?',
  isOldOrder(twoHoursAgo),
  '(should be false)'
);

console.log('\n=== Midnight Reference ===');
const midnight = new Date();
midnight.setHours(0, 0, 0, 0);
console.log('Today Midnight:', midnight.toISOString());
console.log('Current Time:', new Date().toISOString());
