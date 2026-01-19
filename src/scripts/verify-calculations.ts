import { strict as assert } from 'assert';
import Decimal from 'decimal.js';
import { calculateOrderTotals } from '../lib/order-utils'; // Actual Codebase Function

console.log(
  '=== FINAL VERIFICATION: Testing Actual Codebase Implementation ===\n'
);

// --- Test Scenarios ---

const scenarios = [
  {
    name: "Scenario A: The 'Penny Discrepancy' Example",
    // Subtotal 26.25. Tax 6% (1.575). Service 10% (2.625).
    // Raw sum: 26.25 + 1.575 + 2.625 = 30.45
    // Current Display: Tax 1.58, Service 2.63. Sum: 30.46.
    // Gap: 0.01
    items: [{ totalPrice: 26.25 }],
    taxRate: 0.06,
    serviceRate: 0.1,
  },
  {
    name: "Scenario B: User's '0.009' Example (Rounding Down)",
    // Custom case: Price 10.15. Tax 6%.
    // 10.15 * 0.06 = 0.609
    // Math.round(0.609) = 0.61
    // Floor(0.609) = 0.60 (User wants this)
    items: [{ totalPrice: 10.15 }],
    taxRate: 0.06,
    serviceRate: 0,
  },
];

console.log('=== Rounding Logic Comparison ===\n');

scenarios.forEach((scenario) => {
  console.log(`--- ${scenario.name} ---`);

  // Setup inputs (Function expects { totalPrice: number }[])
  const items = scenario.items;

  // Run ACTUAL Code
  const result = calculateOrderTotals(
    items,
    scenario.taxRate,
    scenario.serviceRate
  );

  // Analyze: Check if Receipt Sum matches Total (Integrity Check)
  // And check if Floor logic logic is applied (using our manual check from before)

  // Expected Floor Values for "Penny Discrepancy" (Scenario A)
  // Subtotal: 26.25. Tax(6%): 1.575 -> 1.57. Svc(10%): 2.625 -> 2.62.
  // Total: 26.25 + 1.57 + 2.62 = 30.44.

  if (scenario.name.includes('Penny Discrepancy')) {
    assert.equal(
      result.taxAmount,
      1.57,
      'Tax should be floored (1.575 -> 1.57)'
    );
    assert.equal(
      result.serviceCharge,
      2.62,
      'Service should be floored (2.625 -> 2.62)'
    );
    assert.equal(
      result.totalAmount,
      30.44,
      'Total should be sum of parts (30.44)'
    );
  }

  const visibleSum = new Decimal(result.subtotal)
    .plus(result.taxAmount)
    .plus(result.serviceCharge)
    .toNumber();

  const isCoherent = Math.abs(visibleSum - result.totalAmount) < 0.0001;

  console.log(`   Tax: ${result.taxAmount}, Service: ${result.serviceCharge}`);
  console.log(`   Receipt Sum: ${visibleSum}`);
  console.log(`   System Total: ${result.totalAmount}`);

  if (isCoherent) {
    console.log('   ✅ INTEGRITY PASS: Receipt Sum equals System Total');
  } else {
    console.error('   ❌ INTEGRITY FAIL: Discrepancy detected!');
    process.exit(1);
  }

  console.log('\n------------------------------------------------');
});

console.log(
  '\n✨ Verification Successful: The actual codebase uses correct FLOOR logic.'
);
