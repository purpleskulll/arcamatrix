import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

// Customer sprite mapping - hardcoded for reliability (Vercel /tmp is ephemeral)
const customerMappings: Record<string, string> = {
  'justustheile': 'https://arca-customer-001-bl4yi.sprites.app',
  'e2e-testuser': 'https://arca-customer-004-bl4yi.sprites.app',
  'e2efinal': 'https://arca-customer-002-bl4yi.sprites.app',
  'e2etest2': 'https://arca-customer-003-bl4yi.sprites.app',
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
    return new NextResponse(
      `<html><body style="font-family: system-ui; padding: 40px; text-align: center;">
        <h1>Assistant Not Found</h1>
        <p>No AI assistant found for username: ${username}</p>
      </body></html>`,
      { status: 404, headers: { 'content-type': 'text/html' } }
    );
  }

  // Rewrite to customer's sprite - keeps branded URL in browser address bar
  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, spriteUrl);
  return NextResponse.rewrite(target);
}