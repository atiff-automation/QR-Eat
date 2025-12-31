import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

// Use base directory approach for scalability
const UPLOAD_BASE_DIR =
  process.env.UPLOAD_BASE_DIR || join(process.cwd(), 'public', 'uploads');
const UPLOAD_DIR = join(UPLOAD_BASE_DIR, 'menu-images');

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const filename = params.filename;

    // Security: Prevent directory traversal
    if (
      filename.includes('..') ||
      filename.includes('/') ||
      filename.includes('\\')
    ) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }

    const filepath = join(UPLOAD_DIR, filename);
    const fileBuffer = await readFile(filepath);

    // Determine content type from extension
    const ext = filename.split('.').pop()?.toLowerCase();
    const contentType =
      {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
      }[ext || 'jpg'] || 'image/jpeg';

    // Convert Buffer to Uint8Array for NextResponse compatibility
    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Error serving image:', error);
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }
}
