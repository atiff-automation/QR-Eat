/**
 * Test the fixed timezone-agnostic date comparison
 */
export { };

// Test with various order dates
const testCases = [
  {
    label: 'Today 2 PM GMT+8',
    date: '2026-01-03T06:00:00.000Z',
    expected: false,
  },
  {
    label: 'Today 1 AM GMT+8',
    date: '2026-01-02T17:00:00.000Z',
    expected: false,
  },
  {
    label: 'Yesterday 11 PM GMT+8',
    date: '2026-01-02T15:00:00.000Z',
    expected: true,
  },
  {
    label: 'Yesterday 1 PM GMT+8',
    date: '2026-01-02T05:00:00.000Z',
    expected: true,
  },
  { label: '2 days ago', date: '2026-01-01T10:00:00.000Z', expected: true },
];

console.log('=== Timezone-Agnostic Date Comparison Test ===');
console.log(`Current Time: ${new Date().toISOString()}`);
console.log(`Today (UTC): ${new Date().toISOString().split('T')[0]}`);
console.log('');

testCases.forEach(({ label, date, expected }) => {
  const orderDate = new Date(date);
  const orderDateString = orderDate.toISOString().split('T')[0];
  const todayDateString = new Date().toISOString().split('T')[0];
  const isOld = orderDateString < todayDateString;

  const status = isOld === expected ? '✅ PASS' : '❌ FAIL';

  console.log(`${status} ${label}`);
  console.log(`  UTC: ${date}`);
  console.log(`  Date: ${orderDateString}`);
  console.log(`  Is Old: ${isOld} (expected: ${expected})`);
  console.log('');
});
