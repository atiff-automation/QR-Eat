import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';
import {
  counterReportErrorResponse,
  getCounterReportingContext,
} from '@/lib/counter/reporting-access';
import { getClosedBusinessDay } from '@/lib/services/reporting/counter-report-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    doc.text(`Orders: ${result.summary.orderCount}`, 14, 82);
    doc.line(14, 86, 196, 86);
    let y = 94;
    result.summary.paymentMethods.forEach((method) => {
      doc.text(
        `${method.method}: ${money(method.amount)} (${method.count})`,
        14,
        y
      );
      y += 6;
    });
    doc.line(14, y, 196, y);
    y += 8;
    doc.text(`Opening float: ${money(result.summary.openingFloat)}`, 14, y);
    y += 6;
    doc.text(`Cash expected: ${money(result.summary.cashExpected)}`, 14, y);
    y += 6;
    doc.text(`Cash counted: ${money(result.summary.cashCounted)}`, 14, y);
    y += 6;
    doc.text(`Variance: ${money(result.summary.cashVariance)}`, 14, y);
    y += 8;
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
