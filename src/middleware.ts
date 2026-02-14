import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

// Customer sprite mapping - hardcoded for reliability (Vercel /tmp is ephemeral)
const customerMappings: Record<string, string> = {
  'justustheile': 'https://arca-customer-001-bl4yi.sprites.app',
};

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';

  // Check if this is a customer subdomain (username.arcamatrix.com)
  const isCustomerDomain = hostname.endsWith('.arcamatrix.com') &&
                          !hostname.startsWith('www.') &&
                          hostname !== 'arcamatrix.com';

  if (!isCustomerDomain) {
    return NextResponse.next();
  }

  const username = hostname.split('.arcamatrix.com')[0];

  // Look up customer's sprite URL from hardcoded mappings
  const spriteUrl = customerMappings[username];

  if (!spriteUrl) {
    // Sanitize username to prevent XSS via crafted Host header
    const safe = username.replace(/[^a-z0-9-]/gi, '');
    return new NextResponse(
      `<html><body style="font-family: system-ui; padding: 40px; text-align: center;">
        <h1>Assistant Not Found</h1>
        <p>No AI assistant found for: ${safe}</p>
      </body></html>`,
      { status: 404, headers: { 'content-type': 'text/html' } }
    );
  }

  // Rewrite to customer's sprite - keeps branded URL in browser address bar
  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, spriteUrl);
  return NextResponse.rewrite(target);
}