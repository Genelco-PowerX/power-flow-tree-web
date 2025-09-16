import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Add cache headers for static assets
  if (request.nextUrl.pathname.startsWith('/_next/static/')) {
    response.headers.set(
      'Cache-Control',
      'public, max-age=31536000, immutable' // 1 year for static assets
    );
  }

  // Add cache headers for API routes (already handled in individual routes)
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Most API routes have their own cache headers
    // This is a fallback for any that don't
    if (!response.headers.get('Cache-Control')) {
      response.headers.set(
        'Cache-Control',
        'public, s-maxage=3600, stale-while-revalidate=600' // 1hr default
      );
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/image|favicon.ico).*)',
  ],
};