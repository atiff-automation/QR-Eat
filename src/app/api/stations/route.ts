/**
 * Station CRUD — the work areas a restaurant routes tickets to.
 *
 * Exactly one station per restaurant is the default. Unmapped menu categories
 * fall back to it, and the server raises a configuration warning when that
 * happens (D19).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/database';
import { requireAuth } from '@/lib/rbac/middleware';
import { RESTAURANT_PERMISSIONS } from '@/lib/rbac/permission-constants';

const CreateStationSchema = z.object({
  name: z.string().trim().min(1, 'Station name is required').max(60),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  categoryIds: z.array(z.string().uuid()).max(200).optional(),
});

const stationInclude = {
  categories: {
    include: {
      category: { select: { id: true, name: true, isActive: true } },
    },
  },
  _count: { select: { devices: true } },
} as const;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, [RESTAURANT_PERMISSIONS.SETTINGS]);
    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error || 'Authentication required' },
        { status: auth.statusCode || 401 }
      );
    }

    const restaurantId = auth.user?.restaurantContext?.id;
    if (!restaurantId) {
      return NextResponse.json(
        { error: 'No restaurant context on this session' },
        { status: 403 }
      );
    }

    const stations = await prisma.station.findMany({
      where: { restaurantId },
      include: stationInclude,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return NextResponse.json({ success: true, stations });
  } catch (error) {
    console.error('List stations error:', error);
    return NextResponse.json(
      { error: 'Failed to list stations' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, [RESTAURANT_PERMISSIONS.SETTINGS]);
    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error || 'Authentication required' },
        { status: auth.statusCode || 401 }
      );
    }

    const restaurantId = auth.user?.restaurantContext?.id;
    if (!restaurantId) {
      return NextResponse.json(
        { error: 'No restaurant context on this session' },
        { status: 403 }
      );
    }

    const parsed = CreateStationSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      );
    }

    const { name, isDefault, isActive, sortOrder, categoryIds } = parsed.data;

    if (categoryIds?.length) {
      const valid = await prisma.menuCategory.count({
        where: { id: { in: categoryIds }, restaurantId },
      });
      if (valid !== new Set(categoryIds).size) {
        return NextResponse.json(
          { error: 'One or more categories do not belong to this restaurant' },
          { status: 400 }
        );
      }
    }

    const station = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.station.count({ where: { restaurantId } });

      // The first station is always the default; later ones only when asked.
      const shouldBeDefault = existingCount === 0 || isDefault === true;

      if (shouldBeDefault) {
        await tx.station.updateMany({
          where: { restaurantId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const created = await tx.station.create({
        data: {
          restaurantId,
          name,
          isDefault: shouldBeDefault,
          isActive: isActive ?? true,
          sortOrder: sortOrder ?? 0,
        },
      });

      if (categoryIds?.length) {
        await tx.stationCategory.createMany({
          data: [...new Set(categoryIds)].map((categoryId) => ({
            stationId: created.id,
            categoryId,
          })),
        });
      }

      return tx.station.findUniqueOrThrow({
        where: { id: created.id },
        include: stationInclude,
      });
    });

    return NextResponse.json({ success: true, station }, { status: 201 });
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

    console.error('Create station error:', error);
    return NextResponse.json(
      { error: 'Failed to create station' },
      { status: 500 }
    );
  }
}
