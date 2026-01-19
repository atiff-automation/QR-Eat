import Decimal from 'decimal.js';

// --- Shared Logic ---

// Proposed "Floor" Logic
function calculate_Proposed(
  items: { totalPrice: number }[],
  taxRate: number,
  serviceRate: number
) {
  const subtotal = items.reduce(
    (sum, item) => sum.plus(item.totalPrice),
    new Decimal(0)
  );
  const taxAmount = subtotal
    .times(taxRate)
    .toDecimalPlaces(2, Decimal.ROUND_FLOOR);
  const serviceCharge = subtotal
    .times(serviceRate)
    .toDecimalPlaces(2, Decimal.ROUND_FLOOR);
  const totalAmount = subtotal.plus(taxAmount).plus(serviceCharge);

  return {
    subtotal: subtotal.toNumber(),
    taxAmount: taxAmount.toNumber(),
    serviceCharge: serviceCharge.toNumber(),
    totalAmount: totalAmount.toNumber(),
  };
}

// --- Test: Modify Order (Back-Calculation Risk) ---

console.log('\n=== Modify Order Risk Analysis ===\n');

// Scenario: Small item with rounding
// Price: 0.10. Tax Rate: 6% (0.06).
// True Tax: 0.006.
// Stored Tax (Existing System, Round Half Up): 0.01.

const originalSubtotal = 0.1;
const storedTax = 0.01; // 0.006 rounded up
const trueRate = 0.06;

console.log('Original Order:');
console.log(`Subtotal: ${originalSubtotal}`);
console.log(`True Tax (6%): 0.006`);
console.log(`Stored Tax (Rounded): ${storedTax}`);

// Modification Logic (Current Codebase)
// It calculates rate = storedTax / originalSubtotal
const derivedRate = storedTax / originalSubtotal;
console.log(
  `\nDerived Rate (Stored / Subtotal): ${derivedRate} (${derivedRate * 100}%)`
);

// Now user updates quantity to 100 items
const newQuantity = 100;
const newSubtotal = 0.1 * newQuantity; // 10.00

console.log(
  `\nUser updates quantity to ${newQuantity} (Subtotal: ${newSubtotal})`
);

// Calculate New Tax using Derived Rate
const taxWithDerived = calculate_Proposed(
  [{ totalPrice: newSubtotal }],
  derivedRate,
  0
);
// Calculate New Tax using True Rate (Snapshot)
const taxWithSnapshot = calculate_Proposed(
  [{ totalPrice: newSubtotal }],
  trueRate,
  0
);

console.log('\n--- Comparison ---');
console.log(
  `A. Using Derived Rate (Current Code): Tax = ${taxWithDerived.taxAmount}`
);
console.log(
  `B. Using Snapshot Rate (Recommended): Tax = ${taxWithSnapshot.taxAmount}`
);

const error = taxWithDerived.taxAmount - taxWithSnapshot.taxAmount;
if (error > 0.01) {
  console.log(
    `\n❌ CRITICAL ISSUE: The customer is overcharged by ${error.toFixed(2)} because we used the derived rate!`
  );
  console.log(
    "Solution: We MUST uses the 'taxRateSnapshot' field from the database instead of back-calculating."
  );
} else {
  console.log('\n✅ No significant error found.');
}
