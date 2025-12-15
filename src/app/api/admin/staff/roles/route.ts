import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { 
  getTenantContext, 
  requireAuth, 
  requirePermission 
} from '@/lib/tenant-context';

export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);
    requirePermission(context!, 'staff', 'read');

    // Get all staff roles
    const roles = await prisma.staffRole.findMany({
      orderBy: { level: 'desc' } // Highest level roles first
    });

    return NextResponse.json({
      success: true,
      roles
    });

  } catch (error) {
    console.error('Failed to fetch roles:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Authentication required')) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message.includes('Permission denied')) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to fetch roles' },
      { status: 500 }
    );
  }
}