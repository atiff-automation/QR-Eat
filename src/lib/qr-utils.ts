import QRCode from 'qrcode';

interface QRCodeData {
  tableId: string;
  restaurant: string;
  timestamp: number;
}

export async function generateQRCodeImage(url: string): Promise<string> {
  try {
    const qrCodeDataURL = await QRCode.toDataURL(url, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });
    return qrCodeDataURL;
  } catch (error) {
    console.error('Failed to generate QR code:', error);
    throw new Error('Failed to generate QR code');
  }
}

export async function generateQRCodeSVG(url: string): Promise<string> {
  try {
    const qrCodeSVG = await QRCode.toString(url, {
      type: 'svg',
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });
    return qrCodeSVG;
  } catch (error) {
    console.error('Failed to generate QR code SVG:', error);
    throw new Error('Failed to generate QR code SVG');
  }
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

export function formatPrice(
  price: number | string,
  currency: string = 'MYR',
  locale: string = 'en-MY'
): string {
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
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
