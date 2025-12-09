/**
 * Next.js Server Instrumentation
 *
 * This file runs when the Next.js server starts up.
 * Used to initialize PostgreSQL pub/sub for real-time updates.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 * @see CLAUDE.md - Single Source of Truth, Error Handling
 */

/**
 * Initialize server-side services
 * Called once when the server starts
 */
export async function register() {
  // Only run on server-side (not in Edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      console.log('🚀 [Server Startup] Initializing PostgreSQL pub/sub...');

      // Dynamic import to prevent webpack from bundling pg for client
      const { pgPubSub, PG_EVENTS } = await import('./lib/postgres-pubsub');

      // Initialize PostgreSQL NOTIFY/LISTEN clients
      await pgPubSub.initialize();

      // Subscribe to all event channels
      await pgPubSub.subscribe(
        PG_EVENTS.ORDER_STATUS_CHANGED,
        PG_EVENTS.ORDER_CREATED,
        PG_EVENTS.ORDER_ITEM_STATUS_CHANGED,
        PG_EVENTS.KITCHEN_NOTIFICATION,
        PG_EVENTS.RESTAURANT_NOTIFICATION
      );

      console.log(
        '✅ [Server Startup] PostgreSQL pub/sub initialized successfully'
      );
      console.log('📡 [Server Startup] Listening for real-time events:', {
        channels: Object.values(PG_EVENTS),
        connected: pgPubSub.isConnected(),
      });
    } catch (error) {
      console.error(
        '❌ [Server Startup] Failed to initialize PostgreSQL pub/sub:',
        error
      );
      console.error(
        '⚠️  [Server Startup] Real-time updates may not work until pub/sub is initialized'
      );

      // Don't crash the server - SSE endpoint will try to initialize on first connection
      // This ensures the app still works even if initial connection fails
    }
  }
}
