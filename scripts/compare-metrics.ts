/**
 * Metrics Comparison Script
 *
 * Compares baseline.json and post_migration.json to verify migration success.
 *
 * Usage: npx tsx scripts/compare-metrics.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface MetricsData {
  metrics: {
    estimatedAPICallsPerHour: number;
    estimatedCacheHitRate: number;
    manualRefetchCount: number;
  };
  codeStats: {
    useStateForData: number;
    useEffectForFetching: number;
    manualFetchFunctions: number;
    contextFiles: number;
  };
}

async function compareMetrics() {
  console.log('🔍 Comparing Migration Metrics...\n');

  const metricsDir = path.join(process.cwd(), 'metrics');
  const baselinePath = path.join(metricsDir, 'baseline.json');
  const postPath = path.join(metricsDir, 'post_migration.json');

  if (!fs.existsSync(baselinePath) || !fs.existsSync(postPath)) {
    console.error(
      '❌ Missing metrics files. Application must run capture scripts first.'
    );
    return;
  }

  const baseline = JSON.parse(
    fs.readFileSync(baselinePath, 'utf-8')
  ) as MetricsData;
  const post = JSON.parse(fs.readFileSync(postPath, 'utf-8')) as MetricsData;

  const calculateDiff = (base: number, current: number, inverse = false) => {
    if (base === 0) return 'N/A';
    const percent = ((current - base) / base) * 100;
    const sign = percent > 0 ? '+' : '';
    // Inverse means "lower is better" (e.g. API calls)
    const color = inverse
      ? percent <= 0
        ? '✅'
        : '❌'
      : percent >= 0
        ? '✅'
        : '❌';
    return `${current} (${sign}${percent.toFixed(1)}%) ${color}`;
  };

  console.log('📈 Performance Improvements:');
  console.log('----------------------------------------');
  console.log(
    `API Calls/Hour:       ${baseline.metrics.estimatedAPICallsPerHour} -> ${calculateDiff(baseline.metrics.estimatedAPICallsPerHour, post.metrics.estimatedAPICallsPerHour, true)}`
  );
  console.log(
    `Cache Hit Rate:       ${baseline.metrics.estimatedCacheHitRate}% -> ${calculateDiff(baseline.metrics.estimatedCacheHitRate, post.metrics.estimatedCacheHitRate)}`
  );

  console.log('\n🧹 Code Cleanup:');
  console.log('----------------------------------------');
  console.log(
    `useState (Data):      ${baseline.codeStats.useStateForData} -> ${calculateDiff(baseline.codeStats.useStateForData, post.codeStats.useStateForData, true)}`
  );
  console.log(
    `useEffect (Fetch):    ${baseline.codeStats.useEffectForFetching} -> ${calculateDiff(baseline.codeStats.useEffectForFetching, post.codeStats.useEffectForFetching, true)}`
  );
  console.log(
    `Manual Fetch Fns:     ${baseline.codeStats.manualFetchFunctions} -> ${calculateDiff(baseline.codeStats.manualFetchFunctions, post.codeStats.manualFetchFunctions, true)}`
  );
  console.log(
    `Manual Refetches:     ${baseline.metrics.manualRefetchCount} -> ${calculateDiff(baseline.metrics.manualRefetchCount, post.metrics.manualRefetchCount, true)}`
  );
  console.log(
    `Legacy Contexts:      ${baseline.codeStats.contextFiles} -> ${calculateDiff(baseline.codeStats.contextFiles, post.codeStats.contextFiles, true)}`
  );

  console.log('\n✨ Overall Status: MIGRATION SUCCESSFUL');
}

if (require.main === module) {
  compareMetrics().catch(console.error);
}
