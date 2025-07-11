import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PaymentStatus } from '@/types/payment';

export async function POST(request: NextRequest) {
  try {
    const { paymentIntentId, paymentMethodData, tip } = await request.json();

    // Get the payment intent
    const paymentIntent = await prisma.paymentIntent.findUnique({
      where: { id: paymentIntentId },
      include: {
        order: {
          include: {
            table: true,
            customerSession: true
          }
        }
      }
    });

    if (!paymentIntent) {
      return NextResponse.json(
        { error: 'Payment intent not found' },
        { status: 404 }
      );
    }

    // Check if payment intent has expired
    if (new Date() > paymentIntent.expiresAt) {
      await prisma.paymentIntent.update({
        where: { id: paymentIntentId },
        data: { status: 'cancelled' }
      });

      return NextResponse.json(
        { error: 'Payment intent has expired' },
        { status: 400 }
      );
    }

    let paymentStatus: PaymentStatus = 'processing';
    let transactionId: string | undefined;
    let finalAmount = paymentIntent.amount;

    // Add tip if provided
    if (tip && tip > 0) {
      finalAmount += tip;
    }

    // Process payment based on method
    switch (paymentIntent.paymentMethodId) {
      case 'cash':
        // For cash, mark as succeeded immediately (staff will confirm)
        paymentStatus = 'succeeded';
        transactionId = `CASH_${Date.now()}`;
        break;

      case 'card':
        // In production, this would call Stripe/Square API
        // For demo, simulate successful payment
        paymentStatus = 'succeeded';
        transactionId = `CARD_${Date.now()}`;
        break;

      case 'digital_wallet':
        // In production, this would handle Apple Pay/Google Pay
        paymentStatus = 'succeeded';
        transactionId = `WALLET_${Date.now()}`;
        break;

      default:
        paymentStatus = 'failed';
    }

    // Update payment intent
    const updatedPaymentIntent = await prisma.paymentIntent.update({
      where: { id: paymentIntentId },
      data: {
        status: paymentStatus,
        transactionId,
        confirmedAt: paymentStatus === 'succeeded' ? new Date() : undefined,
        finalAmount,
        tip: tip || 0,
        metadata: {
          ...(paymentIntent.metadata as object),
          paymentMethodData: paymentMethodData || {}
        }
      }
    });

    // If payment succeeded, update order payment status
    if (paymentStatus === 'succeeded') {
      await prisma.order.update({
        where: { id: paymentIntent.orderId },
        data: {
          paymentStatus: 'completed',
          status: 'confirmed',
          confirmedAt: new Date()
        }
      });

      // Update customer session status
      if (paymentIntent.order.customerSession) {
        await prisma.customerSession.update({
          where: { id: paymentIntent.order.customerSession.id },
          data: { status: 'order_placed' }
        });
      }
    }

    return NextResponse.json({
      success: true,
      payment: {
        id: updatedPaymentIntent.id,
        status: updatedPaymentIntent.status,
        amount: updatedPaymentIntent.finalAmount || updatedPaymentIntent.amount,
        currency: updatedPaymentIntent.currency,
        transactionId: updatedPaymentIntent.transactionId,
        tip: updatedPaymentIntent.tip || 0
      }
    });

  } catch (error) {
    console.error('Failed to confirm payment:', error);
    return NextResponse.json(
      { error: 'Failed to confirm payment' },
      { status: 500 }
    );
  }
}