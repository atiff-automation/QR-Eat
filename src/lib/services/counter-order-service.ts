import { createHash, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/database';
import { SequenceManager } from '@/lib/sequence-manager';
import { PostgresEventManager } from '@/lib/postgres-pubsub';
import { canTableAcceptOrders } from '@/lib/table-utils';
import { aggregateTicketStatus } from '@/lib/counter/ticket-status';
import {
  confirmPendingOrder,
  OrderDispatchError,
  type DispatchActor,
  type OrderDispatchTicket,
} from '@/lib/services/order-dispatch-service';

import { COUNTER_SESSION_USER_AGENT } from '@/lib/counter/constants';

export const CounterOrderItemSchema = z.object({
  menuItemId: z.string().uuid('Invalid menu item'),
  quantity: z.number().int().min(1).max(99),
  optionIds: z.array(z.string().uuid('Invalid menu option')).max(40).optional(),
  notes: z.string().max(300).optional().nullable(),
});

export const CounterOrderInputSchema = z
  .object({
    orderType: z.enum(['DINE_IN', 'TAKEAWAY']).default('DINE_IN'),
    tableId: z.string().uuid('Invalid table').optional().nullable(),
    customerName: z.string().trim().max(100).optional().nullable(),
    customerPhone: z.string().trim().max(20).optional().nullable(),
    items: z.array(CounterOrderItemSchema).min(1).max(100),
    specialInstructions: z.string().max(500).optional().nullable(),
    sendToKitchen: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (value.orderType === 'DINE_IN' && !value.tableId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tableId'],
        message: 'A table is required for a dine-in order.',
      });
    }
    if (value.orderType === 'TAKEAWAY' && value.tableId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tableId'],
        message: 'A takeaway order cannot have a table.',
      });
    }
  });

export type CounterOrderInput = z.infer<typeof CounterOrderInputSchema>;

export interface CounterOrderActor extends DispatchActor {
  restaurantId?: string;
}

export interface CounterOrderIssue {
  code: string;
  message: string;
  menuItemId?: string;
  optionId?: string;
}

export interface CounterOrderLine {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  preparationTime: number;
  notes: string | null;
  options: {
    name: string;
    priceModifier: Prisma.Decimal;
  }[];
}

export interface CounterOrderQuote {
  valid: boolean;
  issues: CounterOrderIssue[];
  orderType: 'DINE_IN' | 'TAKEAWAY';
  tableId: string | null;
  tableNumber: string | null;
  tableName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  currency: string;
  taxLabel: string;
  serviceChargeLabel: string;
  lines: {
    menuItemId: string;
    name: string;
    quantity: number;
    unitPrice: string;
    totalAmount: string;
    notes: string | null;
    options: { name: string; priceModifier: string }[];
  }[];
  subtotal: number;
  taxAmount: number;
  serviceCharge: number;
  totalAmount: number;
  estimatedReadyTime: string;
}

export interface CounterOrderResult {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    source: string;
    totalAmount: string;
    tableId: string | null;
    tableNumber: string | null;
    tableName: string | null;
    createdAt: string;
  };
  ticket: OrderDispatchTicket | null;
  warning: string | null;
  replayed: boolean;
}

export class CounterOrderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
    public readonly issues: CounterOrderIssue[] = []
  ) {
    super(message);
    this.name = 'CounterOrderError';
  }
}

interface PricedRestaurant {
  id: string;
  name: string;
  currency: string;
  taxRate: Prisma.Decimal;
  serviceChargeRate: Prisma.Decimal;
  taxLabel: string;
  serviceChargeLabel: string;
  isActive: boolean;
}

interface PricedTable {
  id: string;
  tableNumber: string;
  tableName: string | null;
  status: string;
  restaurantId: string;
}

interface PricedOrder {
  orderType: 'DINE_IN' | 'TAKEAWAY';
  restaurant: PricedRestaurant;
  table: PricedTable | null;
  customerName: string | null;
  customerPhone: string | null;
  lines: CounterOrderLine[];
  issues: CounterOrderIssue[];
  subtotal: number;
  taxAmount: number;
  serviceCharge: number;
  totalAmount: number;
  estimatedReadyTime: Date;
}

function asString(value: Prisma.Decimal | number | string): string {
  return typeof value === 'string' ? value : value.toFixed(2);
}

export function buildCounterOrderRequestHash(input: CounterOrderInput): string {
  const normalized = {
    tableId: input.tableId,
    specialInstructions: input.specialInstructions ?? null,
    items: input.items
      .map((item) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        optionIds: [...(item.optionIds ?? [])].sort(),
        notes: item.notes ?? null,
      }))
      .sort((a, b) => {
        const left = JSON.stringify(a);
        const right = JSON.stringify(b);
        return left.localeCompare(right);
      }),
  };
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function estimateReadyTime(lines: CounterOrderLine[]): Date {
  const maxPrep = Math.max(0, ...lines.map((line) => line.preparationTime));
  const totalItems = lines.reduce((sum, line) => sum + line.quantity, 0);
  const estimatedMinutes = maxPrep + Math.floor(totalItems / 3) * 2;
  return new Date(Date.now() + estimatedMinutes * 60_000);
}

async function priceOrder(
  input: CounterOrderInput,
  actor: CounterOrderActor
): Promise<PricedOrder> {
  if (!actor.restaurantId) {
    throw new CounterOrderError(
      'Restaurant context is required',
      'RESTAURANT_CONTEXT_REQUIRED',
      400
    );
  }

  const orderType = input.orderType ?? 'DINE_IN';
  let restaurant: PricedRestaurant;
  let table: PricedTable | null = null;

  if (orderType === 'DINE_IN') {
    if (!input.tableId) {
      throw new CounterOrderError(
        'A table is required for a dine-in order.',
        'TABLE_REQUIRED',
        400
      );
    }

    const foundTable = await prisma.table.findUnique({
      where: { id: input.tableId },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            currency: true,
            taxRate: true,
            serviceChargeRate: true,
            taxLabel: true,
            serviceChargeLabel: true,
            isActive: true,
          },
        },
      },
    });

    if (!foundTable || foundTable.restaurantId !== actor.restaurantId) {
      throw new CounterOrderError('Table not found', 'TABLE_NOT_FOUND', 404);
    }

    restaurant = foundTable.restaurant;
    table = {
      id: foundTable.id,
      tableNumber: foundTable.tableNumber,
      tableName: foundTable.tableName,
      status: foundTable.status,
      restaurantId: foundTable.restaurantId,
    };
  } else {
    if (input.tableId) {
      throw new CounterOrderError(
        'A takeaway order cannot have a table.',
        'TABLE_NOT_ALLOWED',
        400
      );
    }

    const foundRestaurant = await prisma.restaurant.findUnique({
      where: { id: actor.restaurantId },
      select: {
        id: true,
        name: true,
        currency: true,
        taxRate: true,
        serviceChargeRate: true,
        taxLabel: true,
        serviceChargeLabel: true,
        isActive: true,
      },
    });

    if (!foundRestaurant) {
      throw new CounterOrderError(
        'Restaurant not found',
        'RESTAURANT_NOT_FOUND',
        404
      );
    }
    restaurant = foundRestaurant;
  }

  if (!restaurant.isActive) {
    throw new CounterOrderError(
      'Restaurant is currently closed',
      'RESTAURANT_CLOSED',
      409
    );
  }
  if (table && !canTableAcceptOrders(table.status)) {
    throw new CounterOrderError(
      'This table cannot accept orders right now.',
      'TABLE_NOT_ACCEPTING_ORDERS',
      409
    );
  }

  const menuItemIds = [...new Set(input.items.map((item) => item.menuItemId))];
  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: { in: menuItemIds },
      restaurantId: restaurant.id,
    },
    include: {
      category: {
        select: { id: true, name: true, status: true, isActive: true },
      },
      variationGroups: {
        orderBy: { displayOrder: 'asc' },
        include: {
          options: { orderBy: { displayOrder: 'asc' } },
        },
      },
    },
  });

  const menuById = new Map(menuItems.map((item) => [item.id, item]));
  const issues: CounterOrderIssue[] = [];
  const lines: CounterOrderLine[] = [];

  for (const requested of input.items) {
    const menuItem = menuById.get(requested.menuItemId);
    if (!menuItem) {
      issues.push({
        code: 'ITEM_NOT_FOUND',
        message: 'An item is no longer on the menu.',
        menuItemId: requested.menuItemId,
      });
      continue;
    }
    if (menuItem.status !== 'ACTIVE' || !menuItem.isAvailable) {
      issues.push({
        code: 'ITEM_UNAVAILABLE',
        message: `${menuItem.name} is sold out or unavailable.`,
        menuItemId: menuItem.id,
      });
      continue;
    }
    if (
      menuItem.category.status !== 'ACTIVE' ||
      menuItem.category.isActive === false
    ) {
      issues.push({
        code: 'CATEGORY_UNAVAILABLE',
        message: `${menuItem.name} is not currently available.`,
        menuItemId: menuItem.id,
      });
      continue;
    }

    const requestedOptionIds = requested.optionIds ?? [];
    if (new Set(requestedOptionIds).size !== requestedOptionIds.length) {
      issues.push({
        code: 'OPTION_INVALID',
        message: `${menuItem.name} has a duplicated option.`,
        menuItemId: menuItem.id,
      });
      continue;
    }

    const allOptions = menuItem.variationGroups.flatMap((group) =>
      group.options.map((option) => ({ group, option }))
    );
    const selected = requestedOptionIds.map((id) =>
      allOptions.find(({ option }) => option.id === id)
    );
    if (selected.some((entry) => !entry)) {
      issues.push({
        code: 'OPTION_INVALID',
        message: `${menuItem.name} has an option that is no longer available.`,
        menuItemId: menuItem.id,
      });
      continue;
    }

    let optionIssue = false;
    for (const group of menuItem.variationGroups) {
      const selectedInGroup = group.options.filter((option) =>
        requestedOptionIds.includes(option.id)
      );
      if (selectedInGroup.length < group.minSelections) {
        issues.push({
          code: 'OPTION_SELECTION_REQUIRED',
          message: `${menuItem.name}: choose at least ${group.minSelections} from ${group.name}.`,
          menuItemId: menuItem.id,
        });
        optionIssue = true;
      }
      if (
        group.maxSelections > 0 &&
        selectedInGroup.length > group.maxSelections
      ) {
        issues.push({
          code: 'OPTION_INVALID',
          message: `${menuItem.name}: choose no more than ${group.maxSelections} from ${group.name}.`,
          menuItemId: menuItem.id,
        });
        optionIssue = true;
      }
      if (selectedInGroup.some((option) => !option.isAvailable)) {
        issues.push({
          code: 'OPTION_UNAVAILABLE',
          message: `${menuItem.name}: one of the selected options is unavailable.`,
          menuItemId: menuItem.id,
        });
        optionIssue = true;
      }
    }
    if (optionIssue) continue;

    const selectedOptions = selected
      .filter(
        (
          entry
        ): entry is {
          group: (typeof menuItem.variationGroups)[number];
          option: (typeof menuItem.variationGroups)[number]['options'][number];
        } => entry !== undefined
      )
      .map(({ option }) => ({
        name: option.name,
        priceModifier: option.priceModifier,
      }));
    const optionTotal = selectedOptions.reduce(
      (sum, option) => sum.plus(option.priceModifier),
      new Prisma.Decimal(0)
    );
    const unitPrice = new Prisma.Decimal(menuItem.price).plus(optionTotal);
    const totalAmount = unitPrice.mul(requested.quantity);

    lines.push({
      menuItemId: menuItem.id,
      name: menuItem.name,
      quantity: requested.quantity,
      unitPrice,
      totalAmount,
      preparationTime: menuItem.preparationTime,
      notes: requested.notes?.trim() || null,
      options: selectedOptions,
    });
  }

  const subtotal = lines.reduce(
    (sum, line) => sum.plus(line.totalAmount),
    new Prisma.Decimal(0)
  );
  const taxAmount = subtotal
    .mul(restaurant.taxRate)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_FLOOR);
  const serviceCharge =
    orderType === 'TAKEAWAY'
      ? new Prisma.Decimal(0)
      : subtotal
          .mul(restaurant.serviceChargeRate)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_FLOOR);
  const totalAmount = subtotal.plus(taxAmount).plus(serviceCharge);

  return {
    orderType,
    restaurant,
    table,
    customerName: input.customerName?.trim() || null,
    customerPhone: input.customerPhone?.trim() || null,
    lines,
    issues,
    subtotal: subtotal.toNumber(),
    taxAmount: taxAmount.toNumber(),
    serviceCharge: serviceCharge.toNumber(),
    totalAmount: totalAmount.toNumber(),
    estimatedReadyTime: estimateReadyTime(lines),
  };
}

function quoteFromPriced(priced: PricedOrder): CounterOrderQuote {
  return {
    valid: priced.issues.length === 0,
    issues: priced.issues,
    orderType: priced.orderType,
    tableId: priced.table?.id ?? null,
    tableNumber: priced.table?.tableNumber ?? null,
    tableName: priced.table?.tableName ?? null,
    customerName: priced.customerName,
    customerPhone: priced.customerPhone,
    currency: priced.restaurant.currency,
    taxLabel: priced.restaurant.taxLabel || 'Tax',
    serviceChargeLabel:
      priced.restaurant.serviceChargeLabel || 'Service Charge',
    lines: priced.lines.map((line) => ({
      menuItemId: line.menuItemId,
      name: line.name,
      quantity: line.quantity,
      unitPrice: asString(line.unitPrice),
      totalAmount: asString(line.totalAmount),
      notes: line.notes,
      options: line.options.map((option) => ({
        name: option.name,
        priceModifier: asString(option.priceModifier),
      })),
    })),
    subtotal: priced.subtotal,
    taxAmount: priced.taxAmount,
    serviceCharge: priced.serviceCharge,
    totalAmount: priced.totalAmount,
    estimatedReadyTime: priced.estimatedReadyTime.toISOString(),
  };
}

function orderResponse(order: {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  source: string;
  totalAmount: Prisma.Decimal | number | string;
  tableId: string | null;
  createdAt: Date;
  table: { tableNumber: string; tableName: string | null } | null;
}): CounterOrderResult['order'] {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    source: order.source,
    totalAmount: asString(order.totalAmount),
    tableId: order.tableId,
    tableNumber: order.table?.tableNumber ?? null,
    tableName: order.table?.tableName ?? null,
    createdAt: order.createdAt.toISOString(),
  };
}

async function ticketForOrder(orderId: string): Promise<OrderDispatchTicket> {
  const events = await prisma.orderEvent.findMany({
    where: {
      orderId,
      type: { in: ['order.created', 'order.items.added'] },
    },
    select: { stationId: true, printStatus: true, printedAt: true },
  });
  const aggregate = aggregateTicketStatus(events);
  return {
    routed: events.length > 0,
    stationIds: [...new Set(events.map((event) => event.stationId))],
    unroutedItemIds: [],
    replayed: true,
    ticketStatus: aggregate.aggregate,
  };
}

export async function quoteCounterOrder(
  input: CounterOrderInput,
  actor: CounterOrderActor
): Promise<CounterOrderQuote> {
  const priced = await priceOrder(input, actor);
  return quoteFromPriced(priced);
}

export async function createCounterOrder(
  input: CounterOrderInput,
  actor: CounterOrderActor,
  idempotencyKey: string,
  options: {
    overrideStation?: boolean;
    ipAddress?: string | null;
  } = {}
): Promise<CounterOrderResult> {
  if (!idempotencyKey.trim()) {
    throw new CounterOrderError(
      'Idempotency-Key header is required',
      'IDEMPOTENCY_KEY_REQUIRED',
      400
    );
  }
  if (!actor.restaurantId) {
    throw new CounterOrderError(
      'Restaurant context is required',
      'RESTAURANT_CONTEXT_REQUIRED',
      400
    );
  }

  const requestHash = buildCounterOrderRequestHash(input);
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey },
    include: {
      table: { select: { tableNumber: true, tableName: true } },
    },
  });
  if (existing) {
    if (
      existing.restaurantId !== actor.restaurantId ||
      existing.source !== 'COUNTER' ||
      existing.idempotencyHash !== requestHash
    ) {
      throw new CounterOrderError(
        'Idempotency key was reused with a different order',
        'IDEMPOTENCY_MISMATCH',
        409
      );
    }
    return {
      order: orderResponse(existing),
      ticket: await ticketForOrder(existing.id),
      warning:
        existing.status === 'PENDING'
          ? 'Order is still pending kitchen dispatch.'
          : null,
      replayed: true,
    };
  }

  const priced = await priceOrder(input, actor);
  if (priced.issues.length > 0) {
    throw new CounterOrderError(
      'Some items need attention before this order can be sent.',
      'ORDER_VALIDATION_FAILED',
      409,
      priced.issues
    );
  }

  if (!priced.table) {
    throw new CounterOrderError(
      'Takeaway order creation is not available in this phase.',
      'TAKEAWAY_CREATE_NOT_READY',
      501
    );
  }
  const table = priced.table;

  const { number: dailySeq, formatted: orderNumber } =
    await SequenceManager.getNextOrder(priced.restaurant.id);
  const sessionToken = randomUUID();
  const now = new Date();

  let createdOrder: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    source: string;
    totalAmount: Prisma.Decimal;
    tableId: string | null;
    createdAt: Date;
    table: { tableNumber: string; tableName: string | null } | null;
  };
  try {
    createdOrder = await prisma.$transaction(async (tx) => {
      const session = await tx.customerSession.create({
        data: {
          tableId: table.id,
          sessionToken,
          userAgent: COUNTER_SESSION_USER_AGENT,
          status: 'ENDED',
          expiresAt: now,
          endedAt: now,
        },
      });

      const order = await tx.order.create({
        data: {
          orderNumber,
          dailySeq,
          restaurantId: priced.restaurant.id,
          tableId: table.id,
          customerSessionId: session.id,
          subtotalAmount: priced.subtotal,
          taxAmount: priced.taxAmount,
          serviceCharge: priced.serviceCharge,
          discountAmount: 0,
          totalAmount: priced.totalAmount,
          taxRateSnapshot: priced.restaurant.taxRate,
          serviceChargeRateSnapshot: priced.restaurant.serviceChargeRate,
          taxLabelSnapshot: priced.restaurant.taxLabel,
          serviceChargeLabelSnapshot: priced.restaurant.serviceChargeLabel,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          source: 'COUNTER',
          idempotencyKey,
          idempotencyHash: requestHash,
          takenBy: actor.userType === 'staff' ? actor.userId : null,
          specialInstructions: input.specialInstructions?.trim() || null,
          estimatedReadyTime: priced.estimatedReadyTime,
        },
        include: {
          table: { select: { tableNumber: true, tableName: true } },
        },
      });

      for (const line of priced.lines) {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            menuItemId: line.menuItemId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            totalAmount: line.totalAmount,
            specialInstructions: line.notes,
            status: 'PENDING',
            selectedOptions: {
              create: line.options.map((option) => ({
                name: option.name,
                priceModifier: option.priceModifier,
              })),
            },
          },
        });
      }

      await tx.table.update({
        where: { id: table.id },
        data: { status: 'OCCUPIED' },
      });

      return order;
    });
  } catch (error) {
    // A concurrent duplicate may have won the unique key race. Re-read it and
    // return the same idempotent result rather than creating a second order.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const raced = await prisma.order.findUnique({
        where: { idempotencyKey },
        include: {
          table: { select: { tableNumber: true, tableName: true } },
        },
      });
      if (raced && raced.idempotencyHash === requestHash) {
        return {
          order: orderResponse(raced),
          ticket: await ticketForOrder(raced.id),
          warning:
            raced.status === 'PENDING'
              ? 'Order is still pending kitchen dispatch.'
              : null,
          replayed: true,
        };
      }
    }
    throw error;
  }

  try {
    await prisma.auditLog.create({
      data: {
        tableName: 'orders',
        recordId: createdOrder.id,
        operation: 'CREATE',
        newValues: {
          source: 'COUNTER',
          tableId: table.id,
          itemCount: priced.lines.reduce((sum, line) => sum + line.quantity, 0),
          totalAmount: priced.totalAmount,
        },
        changedBy: actor.userId,
        changedByType: actor.userType,
        ipAddress: options.ipAddress || 'unknown',
      },
    });
  } catch (error) {
    console.error('[CounterOrder] Failed to write creation audit:', error);
  }

  try {
    await PostgresEventManager.publishOrderCreated({
      orderId: createdOrder.id,
      restaurantId: priced.restaurant.id,
      tableId: table.id,
      orderNumber: createdOrder.orderNumber,
      totalAmount: priced.totalAmount,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[CounterOrder] Failed to publish order created:', error);
  }

  let order = createdOrder;
  let ticket: OrderDispatchTicket | null = null;
  let warning: string | null = null;

  if (input.sendToKitchen !== false) {
    try {
      const dispatched = await confirmPendingOrder({
        orderId: createdOrder.id,
        actor,
        overrideStation: options.overrideStation,
        estimatedReadyTime: priced.estimatedReadyTime.toISOString(),
        ipAddress: options.ipAddress,
      });
      order = dispatched.order;
      ticket = dispatched.ticket;
      if (!ticket.routed) {
        warning =
          'Order confirmed, but no kitchen station is mapped. Check station setup.';
      }
    } catch (error) {
      if (error instanceof OrderDispatchError) {
        warning =
          error.code === 'STATION_OFFLINE'
            ? 'Order saved. The kitchen station is offline, so it is waiting in Pending.'
            : `Order saved, but it was not sent to the kitchen: ${error.message}`;
      } else {
        warning =
          'Order saved, but kitchen dispatch failed. Check the Pending queue.';
      }
      console.error('[CounterOrder] Kitchen dispatch failed:', error);
    }
  } else {
    warning = 'Order saved as pending.';
  }

  return {
    order: orderResponse(order),
    ticket,
    warning,
    replayed: false,
  };
}
