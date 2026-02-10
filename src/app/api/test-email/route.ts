import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const to = url.searchParams.get('to');

  if (!to) {
    return NextResponse.json({ error: 'Missing ?to=email' }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      error: 'RESEND_API_KEY not set',
      envKeys: Object.keys(process.env).filter(k => k.startsWith('RESEND') || k.startsWith('STRIPE') || k.startsWith('ADMIN'))
    });
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Arcamatrix <onboarding@arcamatrix.com>',
        to: [to],
        subject: 'Arcamatrix Test Email',
        html: '<h1>Test</h1><p>Dies ist eine Test-E-Mail von Arcamatrix.</p>',
      }),
    });

    const result = await res.json();
    return NextResponse.json({
      status: res.status,
      result,
      apiKeyPrefix: apiKey.substring(0, 8) + '...'
    });
  } catch (error) {
    return NextResponse.json({
      error: String(error),
      apiKeyPrefix: apiKey.substring(0, 8) + '...'
    });
  }
}
