/**
 * Baseline Metrics Capture Script
 *
 * Captures current performance metrics before TanStack Query migration.
 * Run this script to establish a baseline for comparison.
 *
 * Usage: npx tsx scripts/capture-baseline.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface BaselineMetrics {
  timestamp: string;
  description: string;
  metrics: {
    estimatedAPICallsPerHour: number;
    estimatedCacheHitRate: number;
    dataFetchingPattern: string;
    stateManagementApproach: string;
    pollingIntervals: string[];
    manualRefetchCount: number;
  };
  codeStats: {
    useStateForData: number;
    useEffectForFetching: number;
    manualFetchFunctions: number;
    contextFiles: number;
  };
  files: {
    path: string;
    pattern: string;
    linesOfCode: number;
  }[];
}

async function captureBaseline() {
  console.log(
    '📊 Capturing baseline metrics before TanStack Query migration...\n'
  );

  const baseline: BaselineMetrics = {
    timestamp: new Date().toISOString(),
    description:
      'Pre-migration baseline - Manual state management with useState + useEffect',
    metrics: {
      // Estimated based on codebase audit
      estimatedAPICallsPerHour: 1000,
      estimatedCacheHitRate: 60,
      dataFetchingPattern: 'Manual useState + useEffect + fetch functions',
      stateManagementApproach: 'Local component state with manual refetch',
      pollingIntervals: ['60000ms (tables page)'],
      manualRefetchCount: 35, // From audit
    },
    codeStats: {
      useStateForData: 127, // From audit
      useEffectForFetching: 15, // From audit
      manualFetchFunctions: 20, // From audit
      contextFiles: 1, // RestaurantContext
    },
    files: [
      {
        path: 'src/app/dashboard/tables/page.tsx',
        pattern: 'useState + useEffect + fetchTables + polling',
        linesOfCode: 577,
      },
      {
        path: 'src/app/dashboard/staff/page.tsx',
        pattern: 'useState + useEffect + fetchStaff + fetchRoles',
        linesOfCode: 933,
      },
      {
        path: 'src/app/dashboard/menu/page.tsx',
        pattern: 'useState + useEffect + fetchCategories + cache busting',
        linesOfCode: 1560,
      },
      {
        path: 'src/app/dashboard/settings/page.tsx',
        pattern: 'useState + useEffect + fetchSettings + 7 manual refetch',
        linesOfCode: 0, // Unknown
      },
      {
        path: 'src/contexts/RestaurantContext.tsx',
        pattern: 'Custom context with manual state',
        linesOfCode: 127,
      },
    ],
  };

  // Create metrics directory if it doesn't exist
  const metricsDir = path.join(process.cwd(), 'metrics');
  if (!fs.existsSync(metricsDir)) {
    fs.mkdirSync(metricsDir, { recursive: true });
  }

  // Save baseline to file
  const baselinePath = path.join(metricsDir, 'baseline.json');
  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));

  console.log('✅ Baseline metrics captured!\n');
  console.log('📄 Saved to:', baselinePath);
  console.log('\n📊 Baseline Summary:');
  console.log(
    '  - Estimated API Calls/Hour:',
    baseline.metrics.estimatedAPICallsPerHour
  );
  console.log(
    '  - Estimated Cache Hit Rate:',
    baseline.metrics.estimatedCacheHitRate + '%'
  );
  console.log('  - useState for data:', baseline.codeStats.useStateForData);
  console.log(
    '  - useEffect for fetching:',
    baseline.codeStats.useEffectForFetching
  );
  console.log(
    '  - Manual fetch functions:',
    baseline.codeStats.manualFetchFunctions
  );
  console.log('  - Manual refetch calls:', baseline.metrics.manualRefetchCount);
  console.log('\n🎯 Target Improvements:');
  console.log('  - API Calls/Hour: 1000 → 200 (-80%)');
  console.log('  - Cache Hit Rate: 60% → 85% (+25%)');
  console.log('  - useState for data: 127 → 15 (-88%)');
  console.log('  - useEffect for fetching: 15 → 0 (-100%)');
  console.log('  - Manual fetch functions: 20 → 0 (-100%)');
  console.log('  - Manual refetch calls: 35 → 0 (-100%)');
}

// Run if called directly
if (require.main === module) {
  captureBaseline().catch(console.error);
}

export { captureBaseline };
