import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Customer mapping storage - in production use a database
let customerMappings: Record<string, { spriteUrl: string; username: string }> = {};

// Admin endpoint to add customer mapping
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, username, spriteUrl, adminKey } = body;

    // Simple auth - in production use proper auth
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (action === 'add') {
      customerMappings[username] = { spriteUrl, username };
      return NextResponse.json({ success: true, username, spriteUrl });
    }

    if (action === 'get') {
      const mapping = customerMappings[username];
      if (!mapping) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json(mapping);
    }

    if (action === 'list') {
      return NextResponse.json({ customers: customerMappings });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// Get mapping for a username
export async function GET(request: Request) {
  const url = new URL(request.url);
  const username = url.searchParams.get('username');

  if (!username) {
    return NextResponse.json({ error: 'Username required' }, { status: 400 });
  }

  const mapping = customerMappings[username];
  if (!mapping) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  return NextResponse.json(mapping);
}
