import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = request.url;
  const authHeader = request.headers.get('authorization');
  const tokenParam = new URL(url).searchParams.get('token');

  return NextResponse.json({
    url,
    authHeader: authHeader ? authHeader.substring(0, 20) + '...' : null,
    tokenParam: tokenParam ? tokenParam.substring(0, 20) + '...' : null,
    allHeaders: Object.fromEntries(request.headers.entries()),
  });
}
