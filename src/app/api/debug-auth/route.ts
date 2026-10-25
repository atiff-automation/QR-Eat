import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const url = request.url;
  const authHeader = request.headers.get('authorization');

  return NextResponse.json({
    url,
    authHeader: authHeader ? authHeader.substring(0, 20) + '...' : null,
    allHeaders: Object.fromEntries(request.headers.entries()),
  });
}
