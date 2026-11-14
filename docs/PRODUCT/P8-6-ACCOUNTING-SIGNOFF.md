# P8-6 — Accounting sign-off: tax and service in profit

**Status:** **UNSIGNED — management reporting only.**  
**Owner:** Atiff (product owner), pending an accountant's decision.  
**Date prepared:** 2026-11-14  
**Scope:** the P&L report only. The Z report and loyalty report keep their
existing definitions.

Until this packet is signed, the P&L is **management reporting, not statutory
accounting**. Do not use it for tax filing, lender reporting, or any audited
statement.

## 1. The question

Should **net profit** and **gross profit** include the **tax** and **service
charge** collected from guests?

The current P&L says yes: it starts from the amount the guest actually paid
(`Σ Order.totalAmount − refunds`), which contains tax and service charge. That
is convenient and keeps the three reports aligned, but tax is normally a
liability, not revenue, so the reported revenue and margin can be overstated.

## 2. Current arithmetic

The P&L route (`src/app/api/admin/reports/profit-loss/route.ts`) computes:

```text
grossSales = Σ Order.subtotalAmount
discounts  = Σ Order.discountAmount
tax        = Σ Order.taxAmount
service    = Σ Order.serviceCharge
refunds    = |Σ negative Payment.amount| on the refund business date
netSales   = Σ Order.totalAmount − refunds
grossProfit = netSales − COGS
netProfit   = grossProfit − operating expenses
```

`netSales` therefore **includes tax and service charge**. Gross profit and net
profit inherit them, and every margin and percentage uses the tax-inclusive
`netSales` as its denominator.

### Worked example (illustrative)

| Line | Amount |
|---|---:|
| Subtotal | 100.00 |
| Less: promotion discount | −10.00 |
| Taxable base | 90.00 |
| Tax at 6% | +5.40 |
| Service charge at 10% | +9.00 |
| **Guest paid (total)** | **104.40** |
| Refunds | 0.00 |
| **Net sales (current)** | **104.40** |
| COGS | 30.00 |
| **Gross profit (current)** | **74.40** |
| Gross margin (current) | 71.3% |

The 5.40 tax is money the restaurant collects for the tax authority. The
current P&L nevertheless counts it as revenue and as gross profit.

## 3. Option A — keep the current arithmetic

**Definition:** `net = Σ Order.totalAmount − refunds`; gross profit includes tax
and service charge.

- No further arithmetic change; no code, report, or client change.
- The Z report, loyalty report, and P&L stay on one revenue definition, so a
  sale day and a refund day reconcile across all three.
- Gross profit and margin are overstated by the tax collected (and by service
  charge if it is a pass-through).
- The P&L remains management reporting unless the accountant explicitly accepts
  this basis.

**Choose A if:** the business only needs an operational view of cash taken, and
the accountant will prepare statutory figures separately.

## 4. Option B — exclude tax from gross profit

**Definition:** keep `netSales = Σ Order.totalAmount − refunds` for the Z-facing
figure, but add a second revenue figure:

```text
netSalesExTax = netSales − tax
grossProfitExTax = netSalesExTax − COGS
```

The P&L would display gross profit and margins on the ex-tax figure, and state
which basis each number uses. In the worked example:

| Line | Amount |
|---|---:|
| Net sales (tax-inclusive, unchanged) | 104.40 |
| Less: tax | −5.40 |
| **Net sales excluding tax** | **99.00** |
| COGS | 30.00 |
| **Gross profit excluding tax** | **69.00** |
| Gross margin excluding tax | 69.7% |

**Extra figures and rules Option B needs:**

1. `netSalesExTax` (and `grossProfitExTax`) in the P&L API and UI, with the
   tax-inclusive figures retained so the Z/loyalty reconciliation still holds.
2. A **refund tax allocation**. A refund is stored as a negative `Payment` with
   no tax split. To subtract the right tax from a refunded sale, the system
   needs either a stored refund tax amount or a documented allocation rule
   (for example, proportional to the original order's tax rate).
3. Recalculated margins, key metrics, and break-even denominators on the ex-tax
   revenue.
4. A decision on **service charge**: this option excludes tax only. If service
   charge is also a pass-through (for example, distributed to staff), a further
   `netSalesExTaxAndService` figure and rule are needed.

**Choose B if:** the P&L must follow the accountant's revenue-recognition
policy, or gross margin is used for pricing, lender, or investor reporting.

## 5. Consequences at a glance

| | Option A (keep) | Option B (exclude tax) |
|---|---|---|
| Code change | none | P&L API + UI + tests |
| Z/loyalty alignment | unchanged | unchanged if tax-inclusive figures are kept |
| Revenue and gross profit | include tax (and service) | exclude tax; service still included unless separately decided |
| Refund handling | subtract the full refund | needs a tax split or allocation rule |
| Margin denominator | tax-inclusive net sales | ex-tax net sales |
| Statutory use | only if the accountant accepts the basis | closer to standard revenue presentation |

## 6. Decision

The product owner does **not** choose the accounting basis in this packet. An
accountant must sign below.

**Decision:** ☐ Option A — keep `net = Σ totalAmount − refunds`, gross profit
includes tax  
☐ Option B — exclude tax from gross profit, with the extra figures in §4  
☐ Other (attach the basis and the required figures)

| Name | Role | Date | Signature / decision |
|---|---|---|---|
|  |  |  |  |
|  |  |  |  |

**Conditions or notes:**

```text
(accountant to complete)
```

## 7. Until signed

- The P&L is labelled as management reporting in the UI.
- No figure is treated as statutory.
- The Z report, loyalty report, and API contract keep their current
  definitions; this packet changes no number.

## 8. Related P10-close note

P8-3 is not an accounting-basis change: the loyalty report's definition is
unchanged; a legacy omission (batchless positive `PAID` payments) is corrected.
