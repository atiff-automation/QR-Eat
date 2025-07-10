interface QRCodeData {
  tableId: string;
  restaurant: string;
  timestamp: number;
}

export function decodeQRToken(token: string): QRCodeData | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const data = JSON.parse(decoded) as QRCodeData;

    // Validate required fields
    if (!data.tableId || !data.restaurant || !data.timestamp) {
      return null;
    }

    return data;
  } catch (error) {
    console.error('Failed to decode QR token:', error);
    return null;
  }
}

export function generateCustomerSessionToken(): string {
  return crypto.randomUUID();
}

export function formatPrice(price: number | string): string {
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(numPrice);
}

export function calculateItemTotal(
  basePrice: number,
  variations: Array<{ priceModifier: number; quantity?: number }>
): number {
  const variationsTotal = variations.reduce((sum, variation) => {
    return sum + variation.priceModifier * (variation.quantity || 1);
  }, 0);

  return basePrice + variationsTotal;
}

export function isValidTableToken(token: string): boolean {
  const data = decodeQRToken(token);
  if (!data) return false;

  // Check if token is not too old (24 hours)
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const tokenAge = Date.now() - data.timestamp;

  return tokenAge <= maxAge;
}
