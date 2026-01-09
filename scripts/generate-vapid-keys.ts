import webpush from 'web-push';

/**
 * VAPID Key Generation Script
 *
 * Generates a pair of VAPID keys for Web Push notifications.
 * These keys are used to identify your application server to push services.
 *
 * Usage: npm run generate-vapid-keys
 */

try {
  console.log('🔑 Generating VAPID keys...\n');

  const vapidKeys = webpush.generateVAPIDKeys();

  console.log('✅ VAPID keys generated successfully!\n');
  console.log('Add these to your .env file:\n');
  console.log('# Server-side only (never expose to client)');
  console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
  console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
  console.log('VAPID_SUBJECT=mailto:atiff.automation@gmail.com');
  console.log('');
  console.log('# Client-side accessible (safe to expose)');
  console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
  console.log('');
  console.log('⚠️  IMPORTANT:');
  console.log('- Keep VAPID_PRIVATE_KEY secret');
  console.log('- Add these to your production environment variables');
  console.log(
    '- The public key is the same for both VAPID_PUBLIC_KEY and NEXT_PUBLIC_VAPID_PUBLIC_KEY'
  );
} catch (error) {
  console.error('❌ Error generating VAPID keys:', error);
  process.exit(1);
}
