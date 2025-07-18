import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { PaymentMethodType } from '@/types/payment';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const restaurantId = url.searchParams.get('restaurantId');

    if (!restaurantId) {
      return NextResponse.json(
        { error: 'Restaurant ID is required' },
        { status: 400 }
      );
    }

    // For now, return default payment methods
    // In production, this would come from restaurant settings
    const paymentMethods = [
      {
        id: 'cash',
        type: 'cash' as PaymentMethodType,
        name: 'Cash',
        description: 'Pay with cash at the table',
        enabled: true,
        config: {}
      },
      {
        id: 'card',
        type: 'card' as PaymentMethodType,
        name: 'Credit/Debit Card',
        description: 'Pay with your card',
        enabled: true,
        config: {}
      },
      {
        id: 'digital_wallet',
        type: 'digital_wallet' as PaymentMethodType,
        name: 'Digital Wallet',
        description: 'Apple Pay, Google Pay, etc.',
        enabled: true,
        config: {}
      }
    ];

    return NextResponse.json({
      success: true,
      paymentMethods,
      config: {
        currency: 'USD',
        enabledMethods: ['cash', 'card', 'digital_wallet'] as PaymentMethodType[],
        minimumAmount: 0.5,
        maximumAmount: 1000,
        allowTips: true,
        tipSuggestions: [10, 15, 18, 20, 25]
      }
    });
  } catch (error) {
    console.error('Failed to fetch payment methods:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment methods' },
      { status: 500 }
    );
  }
}