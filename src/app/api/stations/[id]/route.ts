/**
 * Single station: read, update, delete.
 *
 * Invariants enforced here:
 * - exactly one default station per restaurant;
 * - a station with devices attached cannot be deleted (reassign first);
 * - a restaurant cannot be left with zero stations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/database';
import { requireAuth } from '@/lib/rbac/middleware';
import { RESTAURANT_PERMISSIONS } from '@/lib/rbac/permission-constants';

const UpdateStationSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
    categoryIds: z.array(z.string().uuid()).max(200).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'No fields to update',
  });

const stationInclude = {
  categories: {
    include: {
      category: { select: { id: true, name: true, isActive: true } },
    },
  },
  _count: { select: { devices: true } },
} as const;

async function requireSettings(request: NextRequest) {
  const auth = await requireAuth(request, [RESTAURANT_PERMISSIONS.SETTINGS]);
  if (!auth.success) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: auth.error || 'Authentication required' },
        { status: auth.statusCode || 401 }
      ),
    };
  }

  const restaurantId = auth.user?.restaurantContext?.id;
  if (!restaurantId) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'No restaurant context on this session' },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, restaurantId };
}

async function validateCategoryIds(
  categoryIds: string[],
  restaurantId: string
): Promise<boolean> {
  if (categoryIds.length === 0) return true;

  const valid = await prisma.menuCategory.count({
    where: { id: { in: categoryIds }, restaurantId },
  });

  return valid === new Set(categoryIds).size;
}

async function promoteDefault(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  excludeId: string
) {
  const next = await tx.station.findFirst({
    where: { restaurantId, isActive: true, NOT: { id: excludeId } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });

  if (next) {
    await tx.station.update({
      where: { id: next.id },
      data: { isDefault: true },
    });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSettings(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;

    const station = await prisma.station.findFirst({
      where: { id, restaurantId: auth.restaurantId },
      include: stationInclude,
    });

    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, station });
  } catch (error) {
    console.error('Get station error:', error);
    return NextResponse.json(
      { error: 'Failed to load station' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSettings(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;

    const parsed = UpdateStationSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      );
    }

    const { name, isDefault, isActive, sortOrder, categoryIds } = parsed.data;

    const existing = await prisma.station.findFirst({
      where: { id, restaurantId: auth.restaurantId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    if (isDefault === false && existing.isDefault) {
      return NextResponse.json(
        { error: 'Make another station the default first' },
        { status: 409 }
      );
    }

    if (isActive === false && existing.isDefault && isDefault !== true) {
      const otherActive = await prisma.station.count({
        where: {
          restaurantId: auth.restaurantId,
          isActive: true,
          NOT: { id },
        },
      });

      if (otherActive === 0) {
        return NextResponse.json(
          { error: 'A restaurant needs at least one active station' },
          { status: 409 }
        );
      }
    }

    if (categoryIds !== undefined) {
      const valid = await validateCategoryIds(categoryIds, auth.restaurantId);
      if (!valid) {
        return NextResponse.json(
          { error: 'One or more categories do not belong to this restaurant' },
          { status: 400 }
        );
      }
    }

    const station = await prisma.$transaction(async (tx) => {
      if (isDefault === true) {
        await tx.station.updateMany({
          where: { restaurantId: auth.restaurantId, isDefault: true },
          data: { isDefault: false },
        });
      }

      if (isActive === false && existing.isDefault && isDefault !== true) {
        await promoteDefault(tx, auth.restaurantId, id);
      }

      if (categoryIds !== undefined) {
        const uniqueCategoryIds = [...new Set(categoryIds)];
        await tx.stationCategory.deleteMany({ where: { stationId: id } });
        if (uniqueCategoryIds.length > 0) {
          // A category routes to exactly one station. Move it here from any
          // other station rather than leaving an ambiguous duplicate.
          await tx.stationCategory.deleteMany({
            where: {
              categoryId: { in: uniqueCategoryIds },
              stationId: { not: id },
            },
          });
          await tx.stationCategory.createMany({
            data: uniqueCategoryIds.map((categoryId) => ({
              stationId: id,
              categoryId,
            })),
          });
        }
      }

      return tx.station.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(isDefault !== undefined ? { isDefault } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
          ...(sortOrder !== undefined ? { sortOrder } : {}),
        },
        include: stationInclude,
      });
    });

    return NextResponse.json({ success: true, station });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'A station with that name already exists' },
        { status: 409 }
      );
    }

    console.error('Update station error:', error);
    return NextResponse.json(
      { error: 'Failed to update station' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSettings(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;

    const existing = await prisma.station.findFirst({
      where: { id, restaurantId: auth.restaurantId },
      include: {
        _count: { select: { devices: { where: { isActive: true } } } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    if (existing._count.devices > 0) {
      return NextResponse.json(
        {
          error:
            'This station still has active devices. Reassign or revoke them first.',
        },
        { status: 409 }
      );
    }

    const remaining = await prisma.station.count({
      where: { restaurantId: auth.restaurantId, NOT: { id } },
    });

    if (remaining === 0) {
      return NextResponse.json(
        { error: 'A restaurant needs at least one station' },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // Revoked phones are kept for history, but they must not pin a station
      // in place forever. Active devices were rejected above.
      await tx.device.deleteMany({
        where: { stationId: id, isActive: false },
      });

      await tx.station.delete({ where: { id } });

      if (existing.isDefault) {
        await promoteDefault(tx, auth.restaurantId, id);
      }
    });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2003'
    ) {
      return NextResponse.json(
        { error: 'This station is still referenced and cannot be deleted' },
        { status: 409 }
      );
    }

    console.error('Delete station error:', error);
    return NextResponse.json(
      { error: 'Failed to delete station' },
      { status: 500 }
    );
  }
}
