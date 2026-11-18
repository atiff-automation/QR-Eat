/**
 * Validation Schemas for Order Modification API
 *
 * Uses Zod for runtime type validation and input sanitization.
 * These schemas ensure data integrity and prevent invalid requests.
 */

import { z } from 'zod';
import { CounterOrderItemSchema } from '@/lib/services/counter-order-service';

/**
 * Schema for adding items to a live order (B3-S).
 *
 * Lines reuse the Counter order-entry schema so menu/option validation and
 * pricing cannot drift between order creation and add-on.
 */
export const AddOrderItemsSchema = z.object({
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
  reason: z.enum([
    'out_of_stock',
    'customer_request',
    'kitchen_error',
    'other',
  ]),
  reasonNotes: z
    .string()
    .max(500, 'Reason notes cannot exceed 500 characters')
    .trim()
    .optional(),
  customerNotified: z.boolean(),
  items: z.array(CounterOrderItemSchema).min(1).max(100),
});

/**
 * Schema for modifying an order
 */
export const ModifyOrderSchema = z.object({
  reason: z.enum([
    'out_of_stock',
    'customer_request',
    'kitchen_error',
    'other',
  ]),
  reasonNotes: z
    .string()
    .max(500, 'Reason notes cannot exceed 500 characters')
    .trim()
    .optional(),
  customerNotified: z.boolean(),
  version: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
  itemChanges: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        action: z.enum(['remove', 'update_quantity']),
        newQuantity: z
          .number()
          .int()
          .min(1, 'Quantity must be at least 1')
          .max(99, 'Quantity cannot exceed 99')
          .optional(),
      })
    )
    .min(1, 'At least one item change is required'),
});

/**
 * Schema for cancelling an order
 */
export const CancelOrderSchema = z.object({
  reason: z.enum([
    'customer_request',
    'kitchen_error',
    'out_of_stock',
    'other',
  ]),
  reasonNotes: z
    .string()
    .max(500, 'Reason notes cannot exceed 500 characters')
    .trim()
    .optional(),
  customerNotified: z.boolean(),
  version: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
});

/**
 * Type exports for TypeScript
 */
export type AddOrderItemsInput = z.infer<typeof AddOrderItemsSchema>;
export type ModifyOrderInput = z.infer<typeof ModifyOrderSchema>;
export type CancelOrderInput = z.infer<typeof CancelOrderSchema>;
