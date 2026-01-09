/**
 * URL Base64 Utility
 *
 * Converts URL-safe base64 strings to Uint8Array for Web Push API.
 * Required for converting VAPID public key for push subscription.
 */

/**
 * Convert URL-safe base64 string to Uint8Array
 *
 * @param base64String - URL-safe base64 encoded string (VAPID public key)
 * @returns Uint8Array suitable for applicationServerKey in push subscription
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  // Add padding if needed
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);

  // Convert URL-safe base64 to standard base64
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  // Decode base64 to binary string
  const rawData = window.atob(base64);

  // Convert binary string to Uint8Array
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}
