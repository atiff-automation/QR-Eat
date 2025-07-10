import { NextResponse } from 'next/server';
import { checkDatabaseConnection } from '@/lib/database';

export async function GET() {
  try {
    const dbHealthy = await checkDatabaseConnection();

    const healthStatus = {
      status: dbHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealthy ? 'up' : 'down',
        api: 'up',
      },
      version: process.env.npm_package_version || '0.1.0',
      environment: process.env.NODE_ENV || 'development',
    };

    return NextResponse.json(healthStatus, {
      status: dbHealthy ? 200 : 503,
    });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}
