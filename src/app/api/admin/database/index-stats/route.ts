/**
 * Index Statistics API
 *
 * Purpose: Real-time monitoring of database index usage and performance
 * - Track index usage statistics
 * - Identify unused indexes
 * - Monitor index sizes
 * - Validate performance improvements
 *
 * Access: Platform admins only
 * Usage: GET /api/admin/database/index-stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { verifyAuthToken, UserType } from '@/lib/auth';

// Constants for analysis
const UNUSED_INDEX_THRESHOLD = 0; // idx_scan = 0
const LARGE_INDEX_WARNING_MB = 100;
const LOW_USAGE_WARNING_SCANS = 10;

interface IndexStat {
  schemaname: string;
  tablename: string;
  indexname: string;
  idx_scan: bigint;
  idx_tup_read: bigint;
  idx_tup_fetch: bigint;
  size: string;
  size_bytes: bigint;
}

interface UnusedIndex {
  schemaname: string;
  tablename: string;
  indexname: string;
  size: string;
  size_bytes: bigint;
}

interface IndexHealth {
  total_indexes: number;
  used_indexes: number;
  unused_indexes: number;
  usage_percentage: number;
  total_index_size_mb: number;
  warnings: string[];
}

/**
 * GET /api/admin/database/index-stats
 *
 * Returns comprehensive index statistics including:
 * - Index usage counts
 * - Index sizes
 * - Unused indexes
 * - Performance insights
 * - Health warnings
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication and admin access
    const authResult = await verifyAuthToken(request);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only platform admins can access database statistics
    if (authResult.user.type !== UserType.PLATFORM_ADMIN) {
      return NextResponse.json(
        { error: 'Access denied - Platform admin required' },
        { status: 403 }
      );
    }

    // Get filter from query params
    const url = new URL(request.url);
    const filterTypeParam = url.searchParams.get('filter'); // 'all', 'used', 'unused', 'performance'
    const sortByParam = url.searchParams.get('sortBy') || 'scans'; // 'scans', 'size', 'name'

    // SECURITY: Validate parameters against whitelist to prevent injection attacks
    const validFilterOptions = [
      'all',
      'used',
      'unused',
      'performance',
    ] as const;
    const filterType = validFilterOptions.includes(
      filterTypeParam as (typeof validFilterOptions)[number]
    )
      ? filterTypeParam
      : null;

    const validSortOptions = ['scans', 'size', 'name'] as const;
    const sortBy = validSortOptions.includes(
      sortByParam as (typeof validSortOptions)[number]
    )
      ? sortByParam
      : 'scans';

    // Fetch index usage statistics
    const indexStats = await prisma.$queryRaw<IndexStat[]>`
      SELECT
        schemaname::text,
        relname::text as tablename,
        indexrelname::text as indexname,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch,
        pg_size_pretty(pg_relation_size(indexrelid)) as size,
        pg_relation_size(indexrelid) as size_bytes
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
      ORDER BY
        CASE
          WHEN ${sortBy}::text = 'scans' THEN idx_scan
          WHEN ${sortBy}::text = 'size' THEN pg_relation_size(indexrelid)
          ELSE 0
        END DESC,
        indexrelname ASC;
    `;

    // Identify unused indexes
    const unusedIndexes = await prisma.$queryRaw<UnusedIndex[]>`
      SELECT
        schemaname::text,
        relname::text as tablename,
        indexrelname::text as indexname,
        pg_size_pretty(pg_relation_size(indexrelid)) as size,
        pg_relation_size(indexrelid) as size_bytes
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
        AND idx_scan = ${UNUSED_INDEX_THRESHOLD}
        AND indexrelid::regclass::text NOT LIKE '%_pkey'
      ORDER BY pg_relation_size(indexrelid) DESC;
    `;

    // Calculate health metrics
    const totalIndexes = indexStats.length;
    const usedIndexes = indexStats.filter(
      (idx) => Number(idx.idx_scan) > 0
    ).length;
    const unusedCount = unusedIndexes.length;
    const usagePercentage =
      totalIndexes > 0 ? (usedIndexes / totalIndexes) * 100 : 0;

    const totalIndexSizeBytes = indexStats.reduce(
      (sum, idx) => sum + Number(idx.size_bytes),
      0
    );
    const totalIndexSizeMB = totalIndexSizeBytes / (1024 * 1024);

    // Generate warnings
    const warnings: string[] = [];

    if (unusedCount > totalIndexes * 0.3) {
      warnings.push(
        `High unused index ratio: ${unusedCount}/${totalIndexes} (${((unusedCount / totalIndexes) * 100).toFixed(1)}%)`
      );
    }

    const largeIndexes = indexStats.filter(
      (idx) => Number(idx.size_bytes) / (1024 * 1024) > LARGE_INDEX_WARNING_MB
    );
    if (largeIndexes.length > 0) {
      warnings.push(
        `${largeIndexes.length} indexes larger than ${LARGE_INDEX_WARNING_MB}MB - consider maintenance`
      );
    }

    const lowUsageIndexes = indexStats.filter(
      (idx) =>
        Number(idx.idx_scan) > 0 &&
        Number(idx.idx_scan) < LOW_USAGE_WARNING_SCANS
    );
    if (lowUsageIndexes.length > 0) {
      warnings.push(
        `${lowUsageIndexes.length} indexes with low usage (<${LOW_USAGE_WARNING_SCANS} scans)`
      );
    }

    const health: IndexHealth = {
      total_indexes: totalIndexes,
      used_indexes: usedIndexes,
      unused_indexes: unusedCount,
      usage_percentage: parseFloat(usagePercentage.toFixed(2)),
      total_index_size_mb: parseFloat(totalIndexSizeMB.toFixed(2)),
      warnings,
    };

    // Filter performance indexes (our new indexes)
    const performanceIndexes = indexStats.filter((idx) =>
      idx.indexname.startsWith('idx_')
    );

    // Apply filter
    let filteredStats = indexStats;
    if (filterType === 'used') {
      filteredStats = indexStats.filter((idx) => Number(idx.idx_scan) > 0);
    } else if (filterType === 'unused') {
      filteredStats = indexStats.filter((idx) => Number(idx.idx_scan) === 0);
    } else if (filterType === 'performance') {
      filteredStats = performanceIndexes;
    }

    // Convert bigint to string for JSON serialization
    const serializedStats = filteredStats.map((idx) => ({
      ...idx,
      idx_scan: idx.idx_scan.toString(),
      idx_tup_read: idx.idx_tup_read.toString(),
      idx_tup_fetch: idx.idx_tup_fetch.toString(),
      size_bytes: idx.size_bytes.toString(),
    }));

    const serializedUnused = unusedIndexes.map((idx) => ({
      ...idx,
      size_bytes: idx.size_bytes.toString(),
    }));

    const serializedPerformance = performanceIndexes.map((idx) => ({
      ...idx,
      idx_scan: idx.idx_scan.toString(),
      idx_tup_read: idx.idx_tup_read.toString(),
      idx_tup_fetch: idx.idx_tup_fetch.toString(),
      size_bytes: idx.size_bytes.toString(),
    }));

    return NextResponse.json({
      success: true,
      health,
      index_stats: serializedStats,
      unused_indexes: serializedUnused,
      performance_indexes: serializedPerformance,
      filters: {
        current: filterType || 'all',
        available: ['all', 'used', 'unused', 'performance'],
      },
      sort: {
        current: sortBy,
        available: ['scans', 'size', 'name'],
      },
    });
  } catch (error) {
    console.error('Failed to fetch index statistics:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch index statistics',
        details:
          process.env.NODE_ENV === 'development'
            ? error instanceof Error
              ? error.message
              : 'Unknown error'
            : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/database/index-stats/reindex
 *
 * Trigger REINDEX for a specific index or all indexes
 * Use with caution in production - locks tables during reindex
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication and admin access
    const authResult = await verifyAuthToken(request);

    if (!authResult.isValid || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (authResult.user.type !== UserType.PLATFORM_ADMIN) {
      return NextResponse.json(
        { error: 'Access denied - Platform admin required' },
        { status: 403 }
      );
    }

    // Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const { indexName, reindexAll } = body;

    if (!indexName && !reindexAll) {
      return NextResponse.json(
        { error: 'Either indexName or reindexAll must be specified' },
        { status: 400 }
      );
    }

    if (reindexAll) {
      // REINDEX all indexes (use with extreme caution)
      await prisma.$executeRawUnsafe('REINDEX DATABASE CONCURRENTLY');

      return NextResponse.json({
        success: true,
        message: 'All indexes reindexed successfully',
        warning: 'This operation may take significant time on large databases',
      });
    }

    // SECURITY: Validate indexName to prevent SQL injection
    // Only allow alphanumeric characters, underscores, and hyphens
    if (!indexName || typeof indexName !== 'string') {
      return NextResponse.json(
        { error: 'Invalid index name' },
        { status: 400 }
      );
    }

    const indexNameRegex = /^[a-zA-Z0-9_]+$/;
    if (!indexNameRegex.test(indexName)) {
      return NextResponse.json(
        {
          error:
            'Invalid index name format - only alphanumeric characters and underscores allowed',
        },
        { status: 400 }
      );
    }

    // Verify the index exists before attempting REINDEX
    const indexExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = ${indexName}
      ) as exists;
    `;

    if (!indexExists[0]?.exists) {
      return NextResponse.json(
        { error: `Index '${indexName}' not found` },
        { status: 404 }
      );
    }

    // Use parameterized query with identifier to prevent SQL injection
    await prisma.$executeRawUnsafe(`REINDEX INDEX CONCURRENTLY "${indexName}"`);

    return NextResponse.json({
      success: true,
      message: `Index ${indexName} reindexed successfully`,
      indexName,
    });
  } catch (error) {
    console.error('Failed to reindex:', error);

    return NextResponse.json(
      {
        error: 'Failed to reindex',
        details:
          process.env.NODE_ENV === 'development'
            ? error instanceof Error
              ? error.message
              : 'Unknown error'
            : undefined,
      },
      { status: 500 }
    );
  }
}
