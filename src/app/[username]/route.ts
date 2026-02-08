import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Store customer subdomain → sprite URL mapping
// In production, this would be a database lookup
const CUSTOMER_SPRITES: Record<string, string> = {};

export async function GET(
  request: Request,
  { params }: { params: { username: string } }
) {
  const username = params.username;

  // Get sprite URL for this username
  const spriteUrl = CUSTOMER_SPRITES[username];

  if (!spriteUrl) {
    return new NextResponse('Customer workspace not found', { status: 404 });
  }

  // Proxy request to customer's sprite
  const url = new URL(request.url);
  const targetUrl = `${spriteUrl}${url.pathname}${url.search}`;

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: request.headers,
      // @ts-ignore
      body: request.body,
    });

    return response;
  } catch (error) {
    return new NextResponse('Workspace temporarily unavailable', { status: 503 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { username: string } }
) {
  return GET(request, { params });
}
