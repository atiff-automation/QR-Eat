import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';
import {
  counterReportErrorResponse,
  getCounterReportingContext,
} from '@/lib/counter/reporting-access';
import {
  getClosedBusinessDay,
  type CounterDaySummary,
} from '@/lib/services/reporting/counter-report-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Three outcomes, never a failed reconciliation that was not performed:
 * - checked and reconciled → "Yes";
 * - checked and not reconciled → "No";
 * - not checked → "Not checked (legacy)" when cash batches predate
 *   `cashPayable` (or the snapshot predates reconciliation entirely), otherwise
 *   "No rounded cash batches" when there was nothing to compare.
 */
function reconciliationStatus(summary: CounterDaySummary): string {
  const reconciliation = summary.cashReconciliation;
  if (!reconciliation) return 'Not checked (legacy)';
  if (!reconciliation.checked) {
    return reconciliation.legacy
      ? 'Not checked (legacy)'
      : 'No rounded cash batches';
  }
  return reconciliation.reconciled ? 'Yes' : 'No';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await getCounterReportingContext(request);
  if (!access.ok) return access.response;

  try {
    const { id } = await params;
    const result = await getClosedBusinessDay(access.value.restaurantId, id);
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const money = (value: string | null | undefined) =>
      `${result.summary.currency} ${Number(value ?? 0).toFixed(2)}`;

    doc.setFontSize(16);
    doc.text('Z REPORT', 14, 18);
    doc.setFontSize(10);
    doc.text(`Business day: ${result.businessDate}`, 14, 28);
    doc.text(`Z number: ${result.zNumber}`, 14, 34);
    doc.text(`Closed: ${result.closedAt}`, 14, 40);
    doc.line(14, 44, 196, 44);
    doc.text(`Net sales: ${money(result.summary.netSales)}`, 14, 52);
    doc.text(`Gross sales: ${money(result.summary.grossSales)}`, 14, 58);
    doc.text(`Tax: ${money(result.summary.tax)}`, 14, 64);
    doc.text(`Service charge: ${money(result.summary.serviceCharge)}`, 14, 70);
    doc.text(`Discounts: ${money(result.summary.discounts)}`, 14, 76);
    doc.text(`Refunds: ${money(result.summary.refunds)}`, 14, 82);
    doc.text(`Rounding: ${money(result.summary.roundingTotal)}`, 14, 88);
    doc.text(`Orders: ${result.summary.orderCount}`, 14, 94);
    doc.line(14, 98, 196, 98);
    let y = 106;
    result.summary.paymentMethods.forEach((method) => {
      const rounding = Number(method.rounding ?? 0);
      doc.text(
        `${method.method}: ${money(method.amount)} (${method.count})${
          rounding !== 0 ? ` · rounding ${money(method.rounding)}` : ''
        }`,
        14,
        y
      );
      y += 6;
    });
    doc.line(14, y, 196, y);
    y += 8;
    const reconciliation = result.summary.cashReconciliation;
    doc.text(`Opening float: ${money(result.summary.openingFloat)}`, 14, y);
    y += 6;
    doc.text(`Cash expected: ${money(result.summary.cashExpected)}`, 14, y);
    y += 6;
    doc.text(`Cash payable: ${money(reconciliation?.cashPayable)}`, 14, y);
    y += 6;
    doc.text(`Cash received: ${money(reconciliation?.cashReceived)}`, 14, y);
    y += 6;
    doc.text(`Change given: ${money(reconciliation?.changeGiven)}`, 14, y);
    y += 6;
    doc.text(`Reconciled: ${reconciliationStatus(result.summary)}`, 14, y);
    y += 6;
    doc.text(`Cash counted: ${money(result.summary.cashCounted)}`, 14, y);
    y += 6;
    doc.text(`Variance: ${money(result.summary.cashVariance)}`, 14, y);
    y += 6;
    if (result.closeNote) {
      doc.text(`Variance reason: ${result.closeNote}`, 14, y);
      y += 6;
    }
    y += 2;
    doc.text('Open orders at close: 0', 14, y);
    y += 6;
    doc.text('Top sellers', 14, y);
    y += 6;
    result.summary.topItems.forEach((item, index) => {
      doc.text(`${index + 1}. ${item.name} x ${item.quantity}`, 14, y);
      y += 6;
    });

    const bytes = doc.output('arraybuffer');
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${result.zNumber}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return counterReportErrorResponse(error, 'Failed to build Z PDF');
  }
}
