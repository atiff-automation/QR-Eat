import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generatePaymentReference } from '@/lib/payment-utils';
import { PaymentRequest, PaymentStatus } from '@/types/payment';

export async function POST(request: NextRequest) {
  try {
    const body: PaymentRequest = await request.json();
    const { orderId, amount, currency, paymentMethodId, metadata } = body;

    // Validate the order exists and get order details
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        table: {
          include: {
            restaurant: true
          }
        },
        customerSession: true
      }
    });

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Verify the amount matches the order total
    if (Math.abs(amount - Number(order.totalAmount)) > 0.01) {
      return NextResponse.json(
        { error: 'Payment amount does not match order total' },
        { status: 400 }
      );
    }

    // Create payment intent in database
    const paymentIntent = await prisma.paymentIntent.create({
      data: {
        orderId,
        amount,
        currency: currency || 'USD',
        paymentMethodId,
        status: 'pending' as PaymentStatus,
        reference: generatePaymentReference(),
        metadata: metadata || {},
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      }
    });

    // Handle different payment methods
    const response: any = {
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      paymentMethodType: paymentMethodId,
      message: 'Payment intent created successfully'
    };

    switch (paymentMethodId) {
      case 'cash':
        // For cash payments, we just create the intent and let staff confirm
        response.message = 'Please prepare cash payment. Staff will confirm receipt.';
        break;

      case 'card':
        // In production, integrate with Stripe/Square/etc.
        response.clientSecret = `pi_test_${paymentIntent.id}`;
        response.message = 'Use test card: 4242 4242 4242 4242';
        break;

      case 'digital_wallet':
        // In production, this would handle Apple Pay/Google Pay
        response.message = 'Digital wallet payment available';
        break;

      default:
        return NextResponse.json(
          { error: 'Unsupported payment method' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      paymentIntent: response
    });

  } catch (error) {
    console.error('Failed to create payment intent:', error);
    return NextResponse.json(
      { error: 'Failed to create payment intent' },
      { status: 500 }
    );
  }
}