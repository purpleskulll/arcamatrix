import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/* (API routes)
     */
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
  ],
};

// Customer sprite mapping - in production, this should be a database lookup
const customerMappings: Record<string, string> = {};

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';

  // Check if this is a customer subdomain (username.arcamatrix.com)
  const isCustomerDomain = hostname.endsWith('.arcamatrix.com') &&
                          !hostname.startsWith('www.') &&
                          hostname !== 'arcamatrix.com';

  if (!isCustomerDomain) {
    // Not a customer subdomain, continue normally
    return NextResponse.next();
  }

  // Extract username from subdomain
  const username = hostname.split('.arcamatrix.com')[0];

  // Look up customer's sprite URL
  // In production, fetch from database or cache
  const spriteMapping = await lookupCustomerSprite(username);

  if (!spriteMapping) {
    // Customer not found - show 404
    return new NextResponse(
      `<html><body style="font-family: system-ui; padding: 40px; text-align: center;">
        <h1>Assistant Not Found</h1>
        <p>No AI assistant found for username: ${username}</p>
      </body></html>`,
      { status: 404, headers: { 'content-type': 'text/html' } }
    );
  }

  // Proxy request to customer's sprite
  const spriteUrl = spriteMapping.spriteUrl;
  const proxyUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, spriteUrl);

  try {
    const proxyResponse = await fetch(proxyUrl.toString(), {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers),
        'host': new URL(spriteUrl).host, // Update host header for sprite
      },
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });

    // Create response with sprite's content
    const responseHeaders = new Headers(proxyResponse.headers);
    responseHeaders.set('x-powered-by', 'Arcamatrix');

    return new NextResponse(proxyResponse.body, {
      status: proxyResponse.status,
      statusText: proxyResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new NextResponse(
      `<html><body style="font-family: system-ui; padding: 40px; text-align: center;">
        <h1>Service Unavailable</h1>
        <p>Your AI assistant is currently unavailable. Please try again shortly.</p>
      </body></html>`,
      { status: 503, headers: { 'content-type': 'text/html' } }
    );
  }
}

async function lookupCustomerSprite(username: string): Promise<{ spriteUrl: string } | null> {
  try {
    // In production, this should query a database
    // For now, query our internal API
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || 'https://arcamatrix.com'}/api/customer-proxy?username=${username}`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to lookup customer sprite:', error);
    return null;
  }
}
