/**
 * Redis Client Configuration
 * Handles Redis connection, pub/sub, and real-time notifications
 */

import Redis from 'ioredis';

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000,
  connectTimeout: 10000,
  commandTimeout: 5000,
};

// Main Redis client for general operations
export const redis = new Redis(redisConfig);

// Separate Redis client for pub/sub operations
export const redisPubSub = new Redis(redisConfig);

// Redis event types
export const REDIS_EVENTS = {
  ORDER_STATUS_CHANGED: 'order:status:changed',
  ORDER_CREATED: 'order:created',
  ORDER_ITEM_STATUS_CHANGED: 'order:item:status:changed',
  KITCHEN_NOTIFICATION: 'kitchen:notification',
  RESTAURANT_NOTIFICATION: 'restaurant:notification',
} as const;

// Type definitions for Redis events
export interface OrderStatusChangedEvent {
  orderId: string;
  oldStatus: string;
  newStatus: string;
  restaurantId: string;
  tableId: string;
  orderNumber: string;
  timestamp: number;
  changedBy?: string;
}

export interface OrderCreatedEvent {
  orderId: string;
  restaurantId: string;
  tableId: string;
  orderNumber: string;
  totalAmount: number;
  timestamp: number;
}

export interface OrderItemStatusChangedEvent {
  orderId: string;
  itemId: string;
  restaurantId: string;
  oldStatus: string;
  newStatus: string;
  timestamp: number;
}

export interface KitchenNotificationEvent {
  type: 'new_order' | 'order_updated' | 'urgent_order';
  orderId: string;
  restaurantId: string;
  message: string;
  timestamp: number;
}

export interface RestaurantNotificationEvent {
  type: 'order_ready' | 'order_served' | 'payment_completed';
  orderId: string;
  restaurantId: string;
  message: string;
  timestamp: number;
}

// Redis utility functions
export class RedisEventManager {
  /**
   * Publish order status change event
   */
  static async publishOrderStatusChange(event: OrderStatusChangedEvent): Promise<void> {
    try {
      await redis.publish(REDIS_EVENTS.ORDER_STATUS_CHANGED, JSON.stringify(event));
      console.log(`Published order status change: ${event.orderId} -> ${event.newStatus}`);
    } catch (error) {
      console.error('Failed to publish order status change:', error);
    }
  }

  /**
   * Publish new order created event
   */
  static async publishOrderCreated(event: OrderCreatedEvent): Promise<void> {
    try {
      await redis.publish(REDIS_EVENTS.ORDER_CREATED, JSON.stringify(event));
      console.log(`Published new order: ${event.orderId}`);
    } catch (error) {
      console.error('Failed to publish order created:', error);
    }
  }

  /**
   * Publish order item status change event
   */
  static async publishOrderItemStatusChange(event: OrderItemStatusChangedEvent): Promise<void> {
    try {
      await redis.publish(REDIS_EVENTS.ORDER_ITEM_STATUS_CHANGED, JSON.stringify(event));
      console.log(`Published item status change: ${event.itemId} -> ${event.newStatus}`);
    } catch (error) {
      console.error('Failed to publish item status change:', error);
    }
  }

  /**
   * Publish kitchen notification
   */
  static async publishKitchenNotification(event: KitchenNotificationEvent): Promise<void> {
    try {
      await redis.publish(REDIS_EVENTS.KITCHEN_NOTIFICATION, JSON.stringify(event));
      console.log(`Published kitchen notification: ${event.type}`);
    } catch (error) {
      console.error('Failed to publish kitchen notification:', error);
    }
  }

  /**
   * Publish restaurant notification
   */
  static async publishRestaurantNotification(event: RestaurantNotificationEvent): Promise<void> {
    try {
      await redis.publish(REDIS_EVENTS.RESTAURANT_NOTIFICATION, JSON.stringify(event));
      console.log(`Published restaurant notification: ${event.type}`);
    } catch (error) {
      console.error('Failed to publish restaurant notification:', error);
    }
  }
}

// Redis connection event handlers
redis.on('connect', () => {
  console.log('Redis client connected');
});

redis.on('ready', () => {
  console.log('Redis client ready');
});

redis.on('error', (error) => {
  console.error('Redis client error:', error);
});

redis.on('close', () => {
  console.log('Redis client connection closed');
});

redisPubSub.on('connect', () => {
  console.log('Redis pub/sub client connected');
});

redisPubSub.on('error', (error) => {
  console.error('Redis pub/sub client error:', error);
});

// Cache utilities
export class RedisCache {
  /**
   * Set cache with expiration
   */
  static async set(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      console.error('Failed to set cache:', error);
    }
  }

  /**
   * Get cached value
   */
  static async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Failed to get cache:', error);
      return null;
    }
  }

  /**
   * Delete cached value
   */
  static async delete(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (error) {
      console.error('Failed to delete cache:', error);
    }
  }

  /**
   * Check if key exists in cache
   */
  static async exists(key: string): Promise<boolean> {
    try {
      const exists = await redis.exists(key);
      return exists === 1;
    } catch (error) {
      console.error('Failed to check cache existence:', error);
      return false;
    }
  }
}

// Session management utilities
export class RedisSession {
  /**
   * Store session data
   */
  static async setSession(sessionId: string, data: any, ttlSeconds: number = 86400): Promise<void> {
    try {
      await redis.setex(`session:${sessionId}`, ttlSeconds, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to set session:', error);
    }
  }

  /**
   * Get session data
   */
  static async getSession<T>(sessionId: string): Promise<T | null> {
    try {
      const data = await redis.get(`session:${sessionId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to get session:', error);
      return null;
    }
  }

  /**
   * Delete session
   */
  static async deleteSession(sessionId: string): Promise<void> {
    try {
      await redis.del(`session:${sessionId}`);
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }

  /**
   * Extend session TTL
   */
  static async extendSession(sessionId: string, ttlSeconds: number = 86400): Promise<void> {
    try {
      await redis.expire(`session:${sessionId}`, ttlSeconds);
    } catch (error) {
      console.error('Failed to extend session:', error);
    }
  }
}

// Rate limiting utilities
export class RedisRateLimit {
  /**
   * Check rate limit
   */
  static async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    try {
      const current = await redis.incr(key);
      
      if (current === 1) {
        await redis.expire(key, windowSeconds);
      }
      
      const ttl = await redis.ttl(key);
      const resetTime = Date.now() + (ttl * 1000);
      
      return {
        allowed: current <= limit,
        remaining: Math.max(0, limit - current),
        resetTime
      };
    } catch (error) {
      console.error('Failed to check rate limit:', error);
      return { allowed: true, remaining: limit, resetTime: Date.now() + (windowSeconds * 1000) };
    }
  }
}

// Export default Redis client
export default redis;