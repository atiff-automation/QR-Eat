#!/usr/bin/env tsx

/**
 * Database Performance Analysis Script
 *
 * Purpose: Collect baseline metrics before adding performance indexes
 * - Analyzes current index usage
 * - Identifies slow queries
 * - Measures table sizes and index sizes
 * - Generates performance baseline report
 *
 * Usage: npx tsx scripts/analyze-database-performance.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Constants for analysis thresholds
const SLOW_QUERY_THRESHOLD_MS = 100;
const UNUSED_INDEX_THRESHOLD = 0; // idx_scan = 0
const INDEX_SIZE_WARNING_MB = 100;

interface IndexStats {
  schemaname: string;
  tablename: string;
  indexname: string;
  idx_scan: bigint;
  idx_tup_read: bigint;
  idx_tup_fetch: bigint;
  size: string;
}

interface TableStats {
  schemaname: string;
  tablename: string;
  row_estimate: bigint;
  total_bytes: bigint;
  index_bytes: bigint;
  toast_bytes: bigint;
  table_bytes: bigint;
}

interface UnusedIndex {
  schemaname: string;
  tablename: string;
  indexname: string;
  size: string;
}

/**
 * Analyze current index usage statistics
 */
async function analyzeIndexUsage(): Promise<IndexStats[]> {
  console.log('\n📊 Analyzing Index Usage...\n');

  const stats = await prisma.$queryRaw<IndexStats[]>`
    SELECT
      schemaname::text,
      relname::text as tablename,
      indexrelname::text as indexname,
      idx_scan,
      idx_tup_read,
      idx_tup_fetch,
      pg_size_pretty(pg_relation_size(indexrelid)) as size
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
    ORDER BY idx_scan DESC
    LIMIT 50;
  `;

  console.log('Top 20 Most Used Indexes:');
  console.log('─'.repeat(100));
  console.log(
    'Table'.padEnd(25),
    'Index'.padEnd(40),
    'Scans'.padStart(10),
    'Size'.padStart(10)
  );
  console.log('─'.repeat(100));

  stats.slice(0, 20).forEach((stat) => {
    console.log(
      stat.tablename.padEnd(25),
      stat.indexname.padEnd(40),
      stat.idx_scan.toString().padStart(10),
      stat.size.padStart(10)
    );
  });

  return stats;
}

/**
 * Identify unused indexes that can be removed
 */
async function findUnusedIndexes(): Promise<UnusedIndex[]> {
  console.log('\n⚠️  Finding Unused Indexes...\n');

  const unusedIndexes = await prisma.$queryRaw<UnusedIndex[]>`
    SELECT
      schemaname::text,
      relname::text as tablename,
      indexrelname::text as indexname,
      pg_size_pretty(pg_relation_size(indexrelid)) as size
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
      AND idx_scan = ${UNUSED_INDEX_THRESHOLD}
      AND indexrelid::regclass::text NOT LIKE '%_pkey'
    ORDER BY pg_relation_size(indexrelid) DESC;
  `;

  if (unusedIndexes.length === 0) {
    console.log('✅ No unused indexes found!\n');
  } else {
    console.log('Unused Indexes (idx_scan = 0):');
    console.log('─'.repeat(80));
    console.log('Table'.padEnd(25), 'Index'.padEnd(40), 'Size'.padStart(10));
    console.log('─'.repeat(80));

    unusedIndexes.forEach((idx) => {
      console.log(
        idx.tablename.padEnd(25),
        idx.indexname.padEnd(40),
        idx.size.padStart(10)
      );
    });
    console.log(`\nTotal: ${unusedIndexes.length} unused indexes\n`);
  }

  return unusedIndexes;
}

/**
 * Analyze table sizes and index overhead
 */
async function analyzeTableSizes(): Promise<TableStats[]> {
  console.log('\n💾 Analyzing Table and Index Sizes...\n');

  const tableStats = await prisma.$queryRaw<TableStats[]>`
    SELECT
      n.nspname::text as schemaname,
      c.relname::text as tablename,
      c.reltuples::bigint AS row_estimate,
      pg_total_relation_size(c.oid)::bigint AS total_bytes,
      pg_indexes_size(c.oid)::bigint AS index_bytes,
      pg_total_relation_size(c.reltoastrelid)::bigint AS toast_bytes,
      pg_relation_size(c.oid)::bigint AS table_bytes
    FROM pg_class c
    LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname = 'public'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 20;
  `;

  console.log('Top 20 Largest Tables:');
  console.log('─'.repeat(120));
  console.log(
    'Table'.padEnd(25),
    'Rows'.padStart(12),
    'Table Size'.padStart(15),
    'Index Size'.padStart(15),
    'Total Size'.padStart(15),
    'Index %'.padStart(10)
  );
  console.log('─'.repeat(120));

  tableStats.forEach((stat) => {
    const tableSizeMB = Number(stat.table_bytes) / (1024 * 1024);
    const indexSizeMB = Number(stat.index_bytes) / (1024 * 1024);
    const totalSizeMB = Number(stat.total_bytes) / (1024 * 1024);
    const indexPercentage =
      totalSizeMB > 0 ? ((indexSizeMB / totalSizeMB) * 100).toFixed(1) : '0.0';

    console.log(
      stat.tablename.padEnd(25),
      stat.row_estimate.toString().padStart(12),
      `${tableSizeMB.toFixed(2)} MB`.padStart(15),
      `${indexSizeMB.toFixed(2)} MB`.padStart(15),
      `${totalSizeMB.toFixed(2)} MB`.padStart(15),
      `${indexPercentage}%`.padStart(10)
    );
  });

  console.log();
  return tableStats;
}

/**
 * Check if pg_stat_statements extension is available for slow query analysis
 */
async function checkSlowQueryExtension(): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
      ) as exists;
    `;

    return result[0]?.exists || false;
  } catch {
    return false;
  }
}

/**
 * Analyze slow queries if pg_stat_statements is available
 */
async function analyzeSlowQueries(): Promise<void> {
  console.log('\n🐌 Analyzing Slow Queries...\n');

  const hasExtension = await checkSlowQueryExtension();

  if (!hasExtension) {
    console.log('⚠️  pg_stat_statements extension not available');
    console.log('   To enable slow query tracking, run as superuser:');
    console.log('   CREATE EXTENSION IF NOT EXISTS pg_stat_statements;');
    console.log(
      "   ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';"
    );
    console.log('   Then restart PostgreSQL\n');
    return;
  }

  try {
    const slowQueries = await prisma.$queryRaw<
      Array<{
        query: string;
        calls: bigint;
        mean_exec_time: number;
        total_exec_time: number;
      }>
    >`
      SELECT
        LEFT(query, 100) as query,
        calls,
        mean_exec_time,
        total_exec_time
      FROM pg_stat_statements
      WHERE mean_exec_time > ${SLOW_QUERY_THRESHOLD_MS}
      ORDER BY mean_exec_time DESC
      LIMIT 20;
    `;

    if (slowQueries.length === 0) {
      console.log(
        `✅ No queries slower than ${SLOW_QUERY_THRESHOLD_MS}ms found!\n`
      );
    } else {
      console.log(`Queries slower than ${SLOW_QUERY_THRESHOLD_MS}ms:`);
      console.log('─'.repeat(120));
      console.log(
        'Query'.padEnd(80),
        'Calls'.padStart(10),
        'Avg (ms)'.padStart(12),
        'Total (ms)'.padStart(15)
      );
      console.log('─'.repeat(120));

      slowQueries.forEach((q) => {
        console.log(
          q.query.substring(0, 77).padEnd(80),
          q.calls.toString().padStart(10),
          q.mean_exec_time.toFixed(2).padStart(12),
          q.total_exec_time.toFixed(2).padStart(15)
        );
      });
      console.log();
    }
  } catch (error) {
    console.log('⚠️  Error analyzing slow queries:', error.message);
  }
}

/**
 * Generate performance baseline summary
 */
async function generateSummary(
  indexStats: IndexStats[],
  unusedIndexes: UnusedIndex[],
  tableStats: TableStats[]
): Promise<void> {
  console.log('\n' + '='.repeat(100));
  console.log('📋 PERFORMANCE BASELINE SUMMARY');
  console.log('='.repeat(100) + '\n');

  // Total indexes
  const totalIndexes = indexStats.length;
  const usedIndexes = indexStats.filter(
    (idx) => Number(idx.idx_scan) > 0
  ).length;
  const unusedCount = unusedIndexes.length;

  console.log(`Total Indexes: ${totalIndexes}`);
  console.log(
    `Used Indexes: ${usedIndexes} (${((usedIndexes / totalIndexes) * 100).toFixed(1)}%)`
  );
  console.log(`Unused Indexes: ${unusedCount}\n`);

  // Total database size
  const totalTableBytes = tableStats.reduce(
    (sum, stat) => sum + Number(stat.table_bytes),
    0
  );
  const totalIndexBytes = tableStats.reduce(
    (sum, stat) => sum + Number(stat.index_bytes),
    0
  );
  const totalBytes = tableStats.reduce(
    (sum, stat) => sum + Number(stat.total_bytes),
    0
  );

  console.log(
    `Total Database Size: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`
  );
  console.log(
    `  - Table Data: ${(totalTableBytes / (1024 * 1024)).toFixed(2)} MB`
  );
  console.log(
    `  - Index Data: ${(totalIndexBytes / (1024 * 1024)).toFixed(2)} MB (${((totalIndexBytes / totalBytes) * 100).toFixed(1)}%)`
  );

  // Recommendations
  console.log('\n📝 Recommendations:\n');

  if (unusedCount > 0) {
    console.log(
      `⚠️  Consider removing ${unusedCount} unused indexes to reduce storage and write overhead`
    );
  }

  const indexPercentage = (totalIndexBytes / totalBytes) * 100;
  if (indexPercentage > 30) {
    console.log(
      `⚠️  Index overhead is ${indexPercentage.toFixed(1)}% (>30% threshold) - review index necessity`
    );
  }

  const largeIndexes = indexStats.filter((idx) => {
    const sizeMB = parseSizeToMB(idx.size);
    return sizeMB > INDEX_SIZE_WARNING_MB;
  });

  if (largeIndexes.length > 0) {
    console.log(
      `⚠️  ${largeIndexes.length} indexes larger than ${INDEX_SIZE_WARNING_MB}MB - consider maintenance`
    );
  }

  console.log(
    '\n✅ Baseline analysis complete - ready for performance index implementation\n'
  );
  console.log('='.repeat(100) + '\n');
}

/**
 * Helper function to parse size string to MB
 */
function parseSizeToMB(sizeStr: string): number {
  const match = sizeStr.match(/(\d+)\s*(kB|MB|GB)/);
  if (!match) return 0;

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 'kB':
      return value / 1024;
    case 'MB':
      return value;
    case 'GB':
      return value * 1024;
    default:
      return 0;
  }
}

/**
 * Main analysis function
 */
async function main() {
  console.log('\n' + '='.repeat(100));
  console.log('🔍 DATABASE PERFORMANCE ANALYSIS');
  console.log('='.repeat(100));
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(
    `Database: ${process.env.DATABASE_URL?.split('@')[1] || 'Unknown'}`
  );
  console.log('='.repeat(100));

  try {
    // Run all analyses
    const indexStats = await analyzeIndexUsage();
    const unusedIndexes = await findUnusedIndexes();
    const tableStats = await analyzeTableSizes();
    await analyzeSlowQueries();
    await generateSummary(indexStats, unusedIndexes, tableStats);
  } catch (error) {
    console.error('\n❌ Error during analysis:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the analysis
main();
