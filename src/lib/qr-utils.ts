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

/**
 * Format price with currency symbol
 * Consolidated function that handles all currency formatting needs
 *
 * @param price - Price value (number, string, or Prisma Decimal)
 * @param currency - Currency code (default: 'MYR')
 * @param locale - Locale for formatting (default: 'en-MY')
 * @returns Formatted price string with currency symbol and space (e.g., "RM 31.98", "$ 31.98")
 */
export function formatPrice(
  price: number | string | { toString(): string }, // Handles Decimal type
  currency: string = 'MYR',
  locale: string = 'en-MY'
): string {
  // Convert to number
  const numPrice =
    typeof price === 'string'
      ? parseFloat(price)
      : typeof price === 'number'
        ? price
        : Number(price.toString()); // Handle Prisma Decimal type

  // Format with Intl.NumberFormat
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    currencyDisplay: 'symbol', // Use symbol (RM, $, €) instead of code (MYR, USD, EUR)
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numPrice);

  // Ensure space between symbol and number
  // Some locales (like en-US) don't add space, so we normalize it
  return formatted.replace(/^([^\d\s]+)(\d)/, '$1 $2');
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
