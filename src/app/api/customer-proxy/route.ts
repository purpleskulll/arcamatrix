import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const MAPPINGS_FILE = '/tmp/customer-sprite-mappings.json';

interface CustomerMapping {
  username: string;
  spriteUrl: string;
  spriteName: string;
  assignedAt: string;
}

interface MappingsStore {
  customers: Record<string, CustomerMapping>;
}

async function loadMappings(): Promise<MappingsStore> {
  try {
    const data = await fs.readFile(MAPPINGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // File doesn't exist yet, return empty
    return { customers: {} };
  }
}

async function saveMappings(mappings: MappingsStore): Promise<void> {
  await fs.writeFile(MAPPINGS_FILE, JSON.stringify(mappings, null, 2), 'utf-8');
}

// Admin endpoint to manage customer mappings
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, username, spriteUrl, spriteName, adminKey } = body;

    // Simple auth - in production use proper auth
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const mappings = await loadMappings();

    if (action === 'add' || action === 'update') {
      mappings.customers[username] = {
        username,
        spriteUrl,
        spriteName,
        assignedAt: new Date().toISOString(),
      };
      await saveMappings(mappings);
      return NextResponse.json({
        success: true,
        username,
        spriteUrl,
        spriteName
      });
    }

    if (action === 'remove') {
      if (mappings.customers[username]) {
        delete mappings.customers[username];
        await saveMappings(mappings);
        return NextResponse.json({ success: true, removed: username });
      }
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    if (action === 'get') {
      const mapping = mappings.customers[username];
      if (!mapping) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json(mapping);
    }

    if (action === 'list') {
      return NextResponse.json({
        customers: mappings.customers,
        count: Object.keys(mappings.customers).length
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Customer proxy error:', error);
    return NextResponse.json({
      error: 'Internal error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// Get mapping for a username (public endpoint for middleware)
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const username = url.searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    const mappings = await loadMappings();
    const mapping = mappings.customers[username];

    if (!mapping) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json(mapping);
  } catch (error) {
    console.error('Get mapping error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
