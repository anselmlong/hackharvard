import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow auth page and static assets pass-through
  const isPublic = pathname.startsWith('/auth') || pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.includes('.');

  // Prepare base response early so we can always append headers
  let response: NextResponse | null = null;

  if (!isPublic) {
    const hasSupabase = Array.from(req.cookies.getAll()).some(c => c.name.startsWith('sb-'));
    // If no cookie, redirect; if cookie exists we allow through and let client verify (avoids stale cookie loop)
    if (!hasSupabase) {
      const url = req.nextUrl.clone();
      url.pathname = '/auth';
      url.searchParams.set('redirectedFrom', pathname);
      response = NextResponse.redirect(url);
    }
  }

  if (!response) {
    response = NextResponse.next();
  }

  // Add COOP/COEP to enable future advanced APIs (e.g. WebAssembly SIMD / sharedArrayBuffer for ML)
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};